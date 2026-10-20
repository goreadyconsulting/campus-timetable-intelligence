import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./fixture";
import { planRequest, applyRemotePatch } from "../lib/supabase-service";
import { loadRemoteData, requestBackend } from "../lib/backend";
const now = "2026-10-20T10:00:00.000Z";
const config = {
  backendEnabled: true,
  backendProvider: "supabase" as const,
  appsScriptUrl: "",
  supabaseUrl: "https://cti.test",
  supabasePublishableKey: "sb_publishable_test",
  geminiEnabled: false,
  dataMode: "shared",
};
function patch(data: any, plan: any) {
  return {
    previousRevision: data.dataRevision,
    dataRevision: plan.revision ?? data.dataRevision,
    changes: plan.changes,
    audit: plan.audit,
    publication: plan.publication || data.publication,
    publications: plan.snapshot ? [plan.snapshot.publication] : [],
  };
}
test("Supabase change patches preserve the dataset, revisions, audits and stale protection", () => {
  const source = fixture();
  const plan = planRequest(
    source,
    {
      action: "mutate",
      requestId: randomUUID(),
      expectedDataRevision: 1,
      mutations: [
        {
          entity: "rooms",
          operation: "update",
          id: "R1",
          expectedRevision: 1,
          record: { capacity: 35 },
        },
      ],
    },
    randomUUID,
    now,
  );
  const updated = applyRemotePatch(source, patch(source, plan))!;
  assert.equal(updated.rooms.find((r) => r.id === "R1")?.capacity, 35);
  assert.equal(source.rooms.find((r) => r.id === "R1")?.capacity, 30);
  assert.equal(updated.dataRevision, 2);
  assert.equal(updated.audit?.length, 1);
  assert.deepEqual(updated.series, source.series);
  assert.equal(applyRemotePatch(updated, patch(source, plan)), null);
  assert.throws(
    () =>
      planRequest(
        updated,
        {
          action: "mutate",
          requestId: randomUUID(),
          expectedDataRevision: 1,
          mutations: [],
        },
        randomUUID,
        now,
      ),
    /STALE/,
  );
});
test("Supabase review and publication keep immutable snapshots and invalidate approval on edits", () => {
  let data = fixture();
  const change = (body: any) => {
    const plan = planRequest(
      data,
      {
        ...body,
        requestId: randomUUID(),
        expectedDataRevision: data.dataRevision,
      },
      randomUUID,
      now,
    );
    data = applyRemotePatch(data, patch(data, plan))!;
    return plan;
  };
  assert.throws(
    () => change({ action: "review", status: "Approved" }),
    /Submit for review/,
  );
  change({ action: "review", status: "In Review" });
  change({ action: "review", status: "Approved" });
  const published = change({
    action: "publish",
    scope: {
      startDate: "2026-09-01",
      endDate: "2027-08-31",
      campusIds: ["BHM"],
      academicYearId: "AY-2026",
      notes: "Test",
      publishedBy: "Team",
    },
  });
  assert.equal(data.publications?.length, 1);
  change({
    action: "mutate",
    mutations: [
      {
        entity: "rooms",
        operation: "update",
        id: "R1",
        expectedRevision: 1,
        record: { capacity: 35 },
      },
    ],
  });
  assert.equal(data.publication?.status, "Draft");
  assert.equal(published.snapshot.data.rooms[0].capacity, 30);
});
test("Supabase cached loads use revision checks and new saves use one request", async () => {
  const originalFetch = globalThis.fetch,
    originalStorage = globalThis.localStorage;
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => memory.get(k) || null,
      setItem: (k: string, v: string) => memory.set(k, v),
    },
  });
  const source = fixture();
  let calls = 0;
  globalThis.fetch = (async (input: any, init: any) => {
    calls++;
    assert.equal(init.headers.apikey, "sb_publishable_test");
    const url = new URL(input);
    if (init.method === "GET") {
      assert.equal(url.pathname, "/rest/v1/rpc/cti_bootstrap");
      assert.equal(url.searchParams.get("p_revision"), "1");
      return Response.json({ unchanged: true, dataRevision: 1 });
    }
    assert.equal(init.headers["Content-Type"], "application/json");
    const body = JSON.parse(init.body);
    const plan = planRequest(source, body, randomUUID, now);
    return Response.json({ ...plan.response, patch: patch(source, plan) });
  }) as typeof fetch;
  try {
    assert.equal(await loadRemoteData(config, source), source);
    calls = 0;
    const saved = await requestBackend(config, {
      action: "mutate",
      expectedDataRevision: 1,
      mutations: [
        {
          entity: "rooms",
          operation: "update",
          id: "R1",
          expectedRevision: 1,
          record: { capacity: 35 },
        },
      ],
    });
    assert.equal(calls, 1);
    assert.equal(saved.patch.dataRevision, 2);
    assert.equal([...memory.values()][0], "{}");
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalStorage,
    });
  }
});
