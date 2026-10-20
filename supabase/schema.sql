-- CTI v5 data service. Application data stays in a non-exposed schema.
-- Shared CTI reads are available through one read-only RPC. Writes and receipts
-- remain restricted to the validated Edge Function.
create schema cti;
revoke all on schema cti from public, anon, authenticated;
grant usage on schema cti to service_role;

create table cti.state (
  id boolean primary key default true check (id),
  revision bigint not null check (revision > 0),
  publication jsonb not null,
  updated_at timestamptz not null default now()
);
create table cti.records (
  entity text not null check (entity = any(array['rooms','lecturers','students','programmes','modules','templates','exceptions','campuses','academicYears','terms','teachingWeeks','series','variants','availabilityRules','travelRules','allocations','conflictReviews'])),
  id text not null,
  record jsonb not null check (jsonb_typeof(record) = 'object' and record->>'id' = id),
  position bigint generated always as identity,
  primary key (entity,id)
);
create table cti.audit (
  id text primary key,
  happened_at timestamptz not null,
  record jsonb not null
);
create index cti_audit_recent on cti.audit (happened_at desc,id);
create table cti.publications (
  id text primary key,
  metadata jsonb not null,
  snapshot jsonb not null
);
create table cti.receipts (
  request_id text primary key,
  body_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
create table cti.suggestions (
  id text primary key,
  record jsonb not null,
  created_at timestamptz not null default now()
);
alter table cti.state enable row level security;
alter table cti.records enable row level security;
alter table cti.audit enable row level security;
alter table cti.publications enable row level security;
alter table cti.receipts enable row level security;
alter table cti.suggestions enable row level security;
create policy internal_service on cti.receipts for all to service_role using (true) with check (true);
create policy internal_service on cti.suggestions for all to service_role using (true) with check (true);
revoke all on all tables in schema cti from public, anon, authenticated;
revoke all on all sequences in schema cti from public, anon, authenticated;
grant all on all tables in schema cti to service_role;
grant usage,select on all sequences in schema cti to service_role;

create function public.cti_bootstrap(p_revision bigint default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare s cti.state%rowtype; result jsonb;
begin
  select * into strict s from cti.state where id=true;
  if p_revision = s.revision then
    return jsonb_build_object('unchanged',true,'dataRevision',s.revision);
  end if;
  select jsonb_object_agg(e.entity,coalesce(r.rows,'[]'::jsonb)) into result
  from unnest(array['rooms','lecturers','students','programmes','modules','templates','exceptions','campuses','academicYears','terms','teachingWeeks','series','variants','availabilityRules','travelRules','allocations','conflictReviews']) e(entity)
  left join (select entity,jsonb_agg(record order by position) as rows from cti.records group by entity) r on r.entity=e.entity;
  return result || jsonb_build_object(
    'schemaVersion','5.0.0','dataRevision',s.revision,'publication',s.publication,
    'studentGroups','[]'::jsonb,'requirements','[]'::jsonb,'sessions','[]'::jsonb,'conflicts','[]'::jsonb,
    'publications',(select coalesce(jsonb_agg(metadata order by (metadata->>'version')::int),'[]'::jsonb) from cti.publications),
    'audit',(select coalesce(jsonb_agg(record order by happened_at desc,id),'[]'::jsonb) from (select * from cti.audit order by happened_at desc,id limit 80) a)
  );
end;
$$;

create function public.cti_receipt(p_request_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select response from cti.receipts where request_id=p_request_id;
$$;
create function public.cti_snapshot(p_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select snapshot from cti.publications where id=p_id;
$$;

create function public.cti_commit(p_request_id text,p_hash text,p_expected bigint,p_plan jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s cti.state%rowtype; previous cti.receipts%rowtype; response jsonb; change jsonb; entry jsonb; next_revision bigint;
begin
  if p_request_id !~ '^[a-zA-Z0-9-]{16,80}$' or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid request identity';
  end if;
  -- Reads never take this lock. Only the short commit is serialized.
  select * into strict s from cti.state where id=true for update;
  select * into previous from cti.receipts where request_id=p_request_id;
  if found then
    if previous.body_hash <> p_hash then
      return jsonb_build_object('ok',false,'requestId',p_request_id,'error',jsonb_build_object('code','INVALID','message','This request ID belongs to a different change.'));
    end if;
    return previous.response;
  end if;
  response := p_plan->'response';
  if response is null or jsonb_typeof(response->'ok') <> 'boolean' then raise exception 'Invalid commit plan'; end if;
  if (response->>'ok')::boolean and p_expected is distinct from s.revision then
    response := jsonb_build_object('ok',false,'requestId',p_request_id,'error',jsonb_build_object('code','STALE','message','STALE: Shared data changed. Refresh and review your changes.'));
  elsif (response->>'ok')::boolean then
    next_revision := coalesce((p_plan->>'revision')::bigint,s.revision);
    if next_revision <> s.revision and next_revision <> s.revision+1 then raise exception 'Invalid revision'; end if;
    for change in select value from jsonb_array_elements(coalesce(p_plan->'changes','[]'::jsonb)) loop
      insert into cti.records(entity,id,record) values(change->>'entity',change->'record'->>'id',change->'record')
      on conflict(entity,id) do update set record=excluded.record;
    end loop;
    for entry in select value from jsonb_array_elements(coalesce(p_plan->'audit','[]'::jsonb)) loop
      insert into cti.audit(id,happened_at,record) values(entry->>'id',(entry->>'timestamp')::timestamptz,entry);
    end loop;
    if p_plan ? 'snapshot' then
      insert into cti.publications(id,metadata,snapshot) values(p_plan->'snapshot'->'publication'->>'id',p_plan->'snapshot'->'publication',p_plan->'snapshot');
    end if;
    if p_plan ? 'suggestion' then
      insert into cti.suggestions(id,record) values(p_plan->'suggestion'->>'id',p_plan->'suggestion');
    end if;
    update cti.state set revision=next_revision,publication=coalesce(p_plan->'publication',s.publication),updated_at=now() where id=true;
    response := response || jsonb_build_object('patch',jsonb_build_object(
      'previousRevision',s.revision,'dataRevision',next_revision,
      'changes',coalesce(p_plan->'changes','[]'::jsonb),'audit',coalesce(p_plan->'audit','[]'::jsonb),
      'publication',coalesce(p_plan->'publication',s.publication),
      'publications',case when p_plan ? 'snapshot' then jsonb_build_array(p_plan->'snapshot'->'publication') else '[]'::jsonb end
    ));
  end if;
  insert into cti.receipts(request_id,body_hash,response) values(p_request_id,p_hash,response);
  return response;
end;
$$;
revoke all on function public.cti_bootstrap(bigint), public.cti_receipt(text), public.cti_snapshot(text), public.cti_commit(text,text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.cti_bootstrap(bigint), public.cti_receipt(text), public.cti_snapshot(text), public.cti_commit(text,text,bigint,jsonb) to service_role;

-- Preserve the existing public, no-login timetable access model. The private
-- schema is not exposed by PostgREST; this grants only the data used by bootstrap.
grant usage on schema cti to anon, authenticated;
grant select on cti.state,cti.records,cti.audit to anon, authenticated;
grant select(id,metadata) on cti.publications to anon, authenticated;
create policy shared_timetable_read on cti.state for select to anon, authenticated using (true);
create policy shared_timetable_read on cti.records for select to anon, authenticated using (true);
create policy shared_timetable_read on cti.audit for select to anon, authenticated using (true);
create policy shared_timetable_read on cti.publications for select to anon, authenticated using (true);
grant execute on function public.cti_bootstrap(bigint) to anon, authenticated;

