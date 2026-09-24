import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fixture } from "./fixture";
class Sheet {
  rows: any[][] = [];
  columns = 26;
  name: string;
  fail: (() => boolean) | null = null;
  constructor(name: string) {
    this.name = name;
  }
  getLastColumn() {
    return Math.max(0, ...this.rows.map((r) => r.length));
  }
  getLastRow() {
    return this.rows.length;
  }
  getMaxColumns() {
    return this.columns;
  }
  insertColumnsAfter(_: number, n: number) {
    this.columns += n;
  }
  setFrozenRows() {}
  getDataRange() {
    return this.getRange(
      1,
      1,
      Math.max(1, this.rows.length),
      Math.max(1, this.getLastColumn()),
    );
  }
  getRange(row: number, col: number, count = 1, width = 1) {
    const sh = this;
    return {
      getValues() {
        return Array.from({ length: count }, (_, i) =>
          Array.from(
            { length: width },
            (_, j) => sh.rows[row + i - 1]?.[col + j - 1] ?? "",
          ),
        );
      },
      setValues(values: any[][]) {
        if (sh.fail?.()) {
          sh.fail = null;
          throw new Error("Simulated write interruption");
        }
        values.forEach((r, i) => {
          sh.rows[row + i - 1] ??= [];
          r.forEach((v, j) => (sh.rows[row + i - 1][col + j - 1] = v));
        });
        return this;
      },
    };
  }
  appendRow(row: any[]) {
    this.rows.push(row);
  }
}
function service(shared?: Map<string, Sheet>) {
  const sheets = shared || new Map<string, Sheet>();
  let seq = 0;
  const ss = {
    getSheetByName: (n: string) => sheets.get(n) || null,
    insertSheet: (n: string) => {
      const s = new Sheet(n);
      sheets.set(n, s);
      return s;
    },
    getSpreadsheetTimeZone: () => "Europe/London",
    getId: () => "test-sheet",
  };
  const sandbox: any = {
    console,
    Intl,
    Date,
    Map,
    Set,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => null }),
    },
    SpreadsheetApp: { openById: () => ss, flush: () => {} },
    LockService: {
      getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
    },
    Session: { getScriptTimeZone: () => "Europe/London" },
    Utilities: {
      getUuid: () => `uuid-${Date.now()}-${++seq}`,
      formatDate: (d: Date, _: string, format: string) =>
        format === "HH:mm"
          ? d.toISOString().slice(11, 16)
          : d.toISOString().slice(0, 10),
    },
    ContentService: {
      MimeType: { JSON: "json", JAVASCRIPT: "js" },
      createTextOutput: (text: string) => ({
        text,
        setMimeType() {
          return this;
        },
      }),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    readFileSync("apps-script/Domain.gs", "utf8") +
      "\n" +
      readFileSync("apps-script/Code.gs", "utf8"),
    sandbox,
  );
  const get = (action: string, p: any = {}) =>
      JSON.parse(sandbox.doGet({ parameter: { action, ...p } }).text),
    post = (body: any) =>
      JSON.parse(
        sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).text,
      );
  return { sheets, sandbox, get, post };
}
function seed(s: ReturnType<typeof service>) {
  s.sandbox.setupBackend();
  const d = fixture();
  for (const entity of [
    "rooms",
    "lecturers",
    "students",
    "programmes",
    "modules",
    "templates",
    "campuses",
    "academicYears",
    "terms",
    "teachingWeeks",
    "series",
    "allocations",
  ])
    for (const r of (d as any)[entity] || []) s.sandbox.writeRecord_(entity, r);
  s.sandbox.setConfigValue_(
    "PUBLICATION_STATE",
    JSON.stringify(d.publication),
    "",
  );
  return d;
}
const request = (n: number) => `request-${String(n).padStart(20, "0")}`;
test("empty shared data is valid, setup is idempotent and legacy destructive routes are unavailable", () => {
  const s = service();
  s.sandbox.setupBackend();
  const data = s.get("bootstrap");
  assert(data.ok);
  assert.equal(data.data.rooms.length, 0);
  assert.equal(s.sandbox.setupBackend().alreadyMigrated, true);
  for (const action of ["saveAll", "saveWorkflow", "clearAll", "setup"])
    assert.equal(
      s.post({ action, requestId: request(action.length), data: {} }).ok,
      false,
    );
});
test("v4 migration preserves extra columns, all rows, capacity, campus permissions and publication history", () => {
  const s = service();
  s.sandbox.ensureSheet_("Rooms");
  s.sandbox.upsertObject_("Rooms", "room_id", "R1", {
    room_id: "R1",
    room_name: "Room 1",
    campus: "Birmingham",
    building: "A",
    room_type: "Workshop",
    capacity: 19,
    status: "Available",
  });
  s.sandbox.upsertObject_("Rooms", "room_id", "R2", {
    room_id: "R2",
    room_name: "Room 2",
    campus: "Birmingham",
    building: "A",
    room_type: "Workshop",
    capacity: 22,
    status: "Available",
  });
  const rooms = s.sheets.get("Rooms")!;
  rooms.rows[0].push("operator_notes");
  rooms.rows[1][rooms.rows[0].length - 1] = "Preserve me";
  s.sandbox.ensureSheet_("PublicationLog");
  s.sheets
    .get("PublicationLog")!
    .appendRow([
      "OLD",
      3,
      "Published",
      "All campuses",
      10,
      "Passed",
      "",
      "Team",
      "2026-09-01",
      "History",
      "Old",
      true,
    ]);
  s.sandbox.writeRecord_("rooms", {
    id: "R1",
    room: "Room 1",
    campus: "Birmingham",
    building: "A",
    type: "Workshop",
    capacity: 19,
    status: "Available",
    revision: 1,
  });
  s.sandbox.setupBackend();
  const d = s.get("bootstrap").data;
  assert.equal(d.rooms.length, 2);
  assert.equal(d.rooms[0].capacity, 19);
  assert.equal(
    rooms.rows[1][rooms.rows[0].indexOf("operator_notes")],
    "Preserve me",
  );
  assert.equal(s.sheets.get("PublicationLog")!.rows.length, 2);
  s.sandbox.setupBackend();
  assert.equal(s.get("bootstrap").data.rooms.length, 2);
});
test("two clients receive stale-write rejection, receipts deduplicate retries, and new IDs are permanent", () => {
  const a = service();
  seed(a);
  const b = service(a.sheets);
  const body = {
    action: "mutate",
    requestId: request(1),
    expectedDataRevision: 1,
    mutations: [
      {
        entity: "rooms",
        operation: "create",
        record: {
          id: "TEMP",
          room: "New room",
          campus: "Birmingham",
          building: "A",
          type: "Workshop",
          capacity: 25,
          status: "Available",
        },
      },
    ],
  };
  const first = a.post(body);
  assert.equal(first.ok, true, JSON.stringify(first));
  const replay = b.post(body);
  assert.deepEqual(replay, first);
  assert.equal(b.get("bootstrap").data.rooms.length, 3);
  assert(first.data.ids.TEMP.startsWith("uuid-"));
  const stale = b.post({ ...body, requestId: request(2) });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, "STALE");
  assert.equal(a.get("bootstrap").data.rooms.length, 3);
});
test("prepared journal rolls forward after an interrupted row write without duplicate records or audits", () => {
  const s = service();
  seed(s);
  s.sheets.get("Rooms")!.fail = () => true;
  const body = {
    action: "mutate",
    requestId: request(3),
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
  };
  const failure = s.post(body);
  assert.equal(failure.pending, true, JSON.stringify(failure));
  const receipt = s.get("requestStatus", { requestId: request(3) }).data;
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  assert.equal(
    s.get("bootstrap").data.rooms.find((r: any) => r.id === "R1").capacity,
    35,
  );
  s.post(body);
  assert.equal(s.get("bootstrap").data.audit.length, 1);
  assert.equal(s.get("bootstrap").data.dataRevision, 2);
});
test("review transitions are revision checked and immutable snapshots survive later edits", () => {
  const s = service();
  seed(s);
  let response = s.post({
    action: "review",
    requestId: request(10),
    expectedDataRevision: 1,
    status: "In Review",
    notes: "Check",
  });
  assert(response.ok, JSON.stringify(response));
  response = s.post({
    action: "review",
    requestId: request(11),
    expectedDataRevision: 2,
    status: "Approved",
  });
  assert(response.ok, JSON.stringify(response));
  response = s.post({
    action: "publish",
    requestId: request(12),
    expectedDataRevision: 3,
    scope: {
      startDate: "2026-09-01",
      endDate: "2027-08-31",
      campusIds: ["BHM"],
      academicYearId: "AY-2026",
      notes: "Released",
      publishedBy: "Team",
    },
  });
  assert(response.ok, JSON.stringify(response));
  const id = response.data.id;
  assert.equal(
    s.get("publicationSnapshot", { id }).data.data.rooms[0].capacity,
    30,
  );
  response = s.post({
    action: "mutate",
    requestId: request(13),
    expectedDataRevision: 4,
    mutations: [
      {
        entity: "rooms",
        operation: "update",
        id: "R1",
        expectedRevision: 1,
        record: { capacity: 32 },
      },
    ],
  });
  assert(response.ok, JSON.stringify(response));
  assert.equal(s.get("bootstrap").data.publication.status, "Draft");
  assert.equal(
    s.get("publicationSnapshot", { id }).data.data.rooms[0].capacity,
    30,
  );
  assert.equal(s.get("bootstrap").data.publications.length, 1);
});
test("suggestion writes have receipts and cannot be submitted twice with the same request ID", () => {
  const s = service();
  s.sandbox.setupBackend();
  const body = {
    action: "submitSuggestion",
    requestId: request(25),
    suggestion: { suggestion: "Allow more useful filters", name: "Team" },
  };
  const first = s.post(body);
  assert(first.ok, JSON.stringify(first));
  assert.deepEqual(s.post(body), first);
  assert.equal(s.sheets.get("Suggestions")!.rows.length, 2);
});
