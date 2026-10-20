import type { AppData } from "@/types";
import {
  applyMutations,
  makePublication,
  publishedVariantChanges,
} from "./domain";

export function planRequest(
  data: AppData,
  body: any,
  uuid: () => string,
  now: string,
) {
  const requestId = String(body.requestId || "");
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))
    throw new Error("A unique request ID is required.");
  let plan: any = { changes: [], audit: [] };
  if (body.action === "mutate") {
    const result = applyMutations(
      data,
      body.mutations,
      body.expectedDataRevision,
      requestId,
      uuid,
      now,
    );
    plan = {
      ...plan,
      changes: result.changes,
      audit: result.audit,
      revision: result.data.dataRevision,
      publication: result.data.publication,
    };
    plan.response = {
      ok: true,
      requestId,
      revision: plan.revision,
      data: { ids: result.ids },
    };
  } else if (body.action === "review" || body.action === "publish") {
    if (body.expectedDataRevision !== data.dataRevision)
      throw new Error("STALE: Refresh before reviewing or publishing.");
    plan.revision = data.dataRevision! + 1;
    if (body.action === "review") {
      if (!["Draft", "In Review", "Approved"].includes(body.status))
        throw new Error("Invalid review status.");
      if (
        body.status === "Approved" &&
        data.publication?.status !== "In Review"
      )
        throw new Error("Submit for review before approval.");
      plan.publication = {
        ...data.publication,
        status: body.status,
        notes: String(body.notes || ""),
        dataRevision: plan.revision,
      };
    } else {
      plan.snapshot = makePublication(data, body.scope, uuid, now);
      plan.changes = publishedVariantChanges(
        data,
        plan.snapshot.publication,
        now,
      );
      plan.publication = {
        ...data.publication,
        status: "Published",
        version: plan.snapshot.publication.version,
        lastPublishedAt: now,
        publishedBy: body.scope.publishedBy,
        notes: body.scope.notes,
        dataRevision: plan.revision,
      };
    }
    plan.audit = [
      {
        id: uuid(),
        timestamp: now,
        action: body.action,
        entityType: "publication",
        entityId: plan.snapshot?.publication.id || "review",
        actor: body.scope?.publishedBy || "Timetabling team",
        before: data.publication,
        after: plan.publication,
        reason: body.notes || body.scope?.notes || "",
        requestId,
        appVersion: "5.0.0",
      },
    ];
    plan.response = {
      ok: true,
      requestId,
      revision: plan.revision,
      data: plan.snapshot?.publication || plan.publication,
    };
  } else if (body.action === "submitSuggestion") {
    const s = body.suggestion || {};
    const clean = (value: unknown, max: number) =>
      String(value || "")
        .trim()
        .slice(0, max);
    const suggestion = clean(s.suggestion, 5000);
    if (suggestion.length < 10)
      throw new Error("Suggestion must contain at least 10 characters.");
    const id = uuid();
    plan.suggestion = {
      id,
      submittedAt: now,
      name: clean(s.name, 120),
      email: clean(s.email, 160),
      area: clean(s.area, 120),
      category: clean(s.category, 120),
      rating: Number(s.rating) || 0,
      suggestion,
      page: clean(s.page, 200),
      status: "New",
      userAgent: clean(s.userAgent, 500),
    };
    plan.response = {
      ok: true,
      requestId,
      data: { suggestionId: id, submittedAt: now },
    };
  } else throw new Error("This action is not supported.");
  return plan;
}

export function applyRemotePatch(source: AppData, patch: any): AppData | null {
  if (
    !patch ||
    patch.previousRevision !== source.dataRevision ||
    !Number.isInteger(patch.dataRevision) ||
    !Array.isArray(patch.changes)
  )
    return null;
  const data = structuredClone(source);
  for (const change of patch.changes) {
    const key = change.entity as keyof AppData;
    const rows = (data[key] as any[] | undefined) || [];
    const index = rows.findIndex((r) => r.id === change.record.id);
    if (index < 0) rows.push(change.record);
    else rows[index] = change.record;
    (data as any)[key] = rows;
  }
  data.dataRevision = patch.dataRevision;
  data.publication = patch.publication;
  const newAudit = [...(patch.audit || [])].reverse();
  const ids = new Set(newAudit.map((a: any) => a.id));
  data.audit = [
    ...newAudit,
    ...(data.audit || []).filter((a) => !ids.has(a.id)),
  ].slice(0, 80);
  const publications = new Map((data.publications || []).map((p) => [p.id, p]));
  for (const p of patch.publications || []) publications.set(p.id, p);
  data.publications = [...publications.values()];
  return data;
}
