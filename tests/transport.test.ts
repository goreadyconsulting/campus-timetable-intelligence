import test from "node:test";
import assert from "node:assert/strict";
import { requestBackend } from "../lib/backend";
test("unconfirmed saves retain IDs across reload/revision changes and are never resent with no-cors", async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => memory.get(k) || null,
      setItem: (k: string, v: string) => memory.set(k, v),
    },
  });
  let writes = 0,
    id = "",
    confirmed = false;
  globalThis.fetch = (async (url: any, init: any) => {
    assert.notEqual(init?.mode, "no-cors");
    if (init?.method === "POST") {
      writes++;
      id = JSON.parse(init.body).requestId;
      throw new Error("Lost response");
    }
    return new Response(
      JSON.stringify({
        ok: true,
        data: confirmed
          ? { ok: true, requestId: id, data: { ids: { TEMP: "SERVER-ID" } } }
          : null,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  const config = {
    backendEnabled: true,
    appsScriptUrl: "https://backend.test/exec",
    geminiEnabled: false,
    dataMode: "shared",
  };
  const body = {
    action: "mutate",
    expectedDataRevision: 1,
    mutations: [
      { entity: "rooms", operation: "create", record: { room: "New" } },
    ],
  };
  try {
    await assert.rejects(
      requestBackend(config, body),
      /confirmation is unavailable/,
    );
    assert(memory.get("cti-pending-requests-v5")?.includes(id));
    confirmed = true;
    const result = await requestBackend(config, {
      ...body,
      expectedDataRevision: 2,
    });
    assert.equal(result.requestId, id);
    assert.equal(writes, 1);
    assert.equal(memory.get("cti-pending-requests-v5"), "{}");
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalStorage,
    });
  }
});
