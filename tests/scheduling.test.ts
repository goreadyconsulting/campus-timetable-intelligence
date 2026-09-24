import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture";
import { baseDates, resolveOccurrences, variantDates } from "../lib/recurrence";
import { toUtc, parseWeeks, datePlus } from "../lib/academic";
import { assertArchive, assertRecord } from "../lib/validation";
import {
  detectOccurrenceConflicts,
  resourceAvailable,
} from "../lib/constraints";
import {
  applyMutations,
  makePublication,
  publicationReadiness,
} from "../lib/domain";
import { timetableIcs } from "../lib/export";
import { normaliseCampusData } from "../lib/master-data";
import { previewImport } from "../lib/import";
import { planSchedule } from "../lib/planner";
import type { ScheduleVariant } from "../types/scheduling";
const dates = (d = fixture()) => baseDates(d.series![0], d.teachingWeeks!);
const week = (n: number) => dates().find((x) => x.week.weekNumber === n)!.date;
const variant = (patch: Partial<ScheduleVariant> = {}): ScheduleVariant => ({
  id: "V1",
  seriesId: "SER-S1",
  scope: "single_occurrence",
  effectiveDate: week(6),
  operation: "override",
  patch: { startLocalTime: "13:00", endLocalTime: "15:00" },
  reason: "Change",
  status: "Draft",
  createdAt: "2026-09-01",
  revision: 1,
  ...patch,
});
const all = (d = fixture()) =>
  resolveOccurrences(d, "2026-09-01", "2027-08-31", true);
test("A: week six override preserves all other dates and local base times", () => {
  const d = fixture();
  d.variants = [variant()];
  const o = all(d);
  assert.equal(o.find((s) => s.teachingWeek === 6)?.start, "13:00");
  assert(
    o.filter((s) => s.teachingWeek !== 6).every((s) => s.start === "09:00"),
  );
  assert.equal(o.length, 11);
});
test("B: week set changes only 8 to 10", () => {
  const d = fixture();
  d.variants = [variant({ scope: "week_set", teachingWeeks: [8, 9, 10] })];
  assert.deepEqual(
    all(d)
      .filter((s) => s.start === "13:00")
      .map((s) => s.teachingWeek),
    [8, 9, 10],
  );
});
test("C: cancel eleven retains twelve", () => {
  const d = fixture();
  d.variants = [
    variant({ effectiveDate: week(11), operation: "cancel", patch: {} }),
  ];
  const active = resolveOccurrences(d, "2026-09-01", "2027-08-31");
  assert(!active.some((s) => s.teachingWeek === 11));
  assert(active.some((s) => s.teachingWeek === 12));
});
test("D: this-and-following changes all later occurrences", () => {
  const d = fixture();
  d.variants = [variant({ scope: "this_and_following" })];
  assert(
    all(d)
      .filter((s) => s.teachingWeek! >= 6)
      .every((s) => s.start === "13:00"),
  );
  assert(
    all(d)
      .filter((s) => s.teachingWeek! < 6)
      .every((s) => s.start === "09:00"),
  );
});
test("E: variant creates a real resource/student clash", () => {
  const d = fixture();
  d.series!.push({
    ...d.series![0],
    id: "S2",
    staffIds: ["L2"],
    locationId: "R2",
    startLocalTime: "13:00",
    endLocalTime: "15:00",
  });
  assert(!detectOccurrenceConflicts(d, all(d)).length);
  d.variants = [
    variant({
      patch: {
        startLocalTime: "13:00",
        endLocalTime: "15:00",
        locationId: "R2",
        staffIds: ["L2"],
      },
    }),
  ];
  const types = detectOccurrenceConflicts(d, all(d)).map((c) => c.type);
  assert(types.includes("Location double booking"));
  assert(types.includes("Staff double booking"));
  assert(types.includes("Individual student clash"));
});
test("F: revert restores base without touching published snapshot", () => {
  const d = fixture();
  d.variants = [variant()];
  const snapshot = structuredClone(d);
  d.variants[0].archived = true;
  assert(all(d).every((o) => o.start === "09:00"));
  assert.equal(all(snapshot).find((s) => s.teachingWeek === 6)?.start, "13:00");
});
test("priority is single > weeks > range > following; duplicate priority rejected", () => {
  const d = fixture();
  d.variants = [
    variant({
      id: "following",
      scope: "this_and_following",
      effectiveDate: week(1),
      patch: { startLocalTime: "12:00", endLocalTime: "14:00" },
    }),
    variant({
      id: "range",
      scope: "date_range",
      startDate: week(4),
      endDate: week(12),
      patch: { startLocalTime: "14:00", endLocalTime: "16:00" },
    }),
    variant({
      id: "weeks",
      scope: "week_set",
      teachingWeeks: [5, 6],
      patch: { startLocalTime: "16:00", endLocalTime: "18:00" },
    }),
    variant(),
  ];
  assert.equal(all(d).find((s) => s.teachingWeek === 6)?.start, "13:00");
  assert.equal(all(d).find((s) => s.teachingWeek === 5)?.start, "16:00");
  assert.equal(all(d).find((s) => s.teachingWeek === 4)?.start, "14:00");
  assert.equal(all(d).find((s) => s.teachingWeek === 1)?.start, "12:00");
  assert.throws(
    () => assertRecord(d, "variants", variant({ id: "duplicate" })),
    /same priority/,
  );
});
test("holidays excluded; moved occurrences resolve in their effective date range", () => {
  const d = fixture();
  assert(!all(d).some((s) => s.teachingWeek === 7));
  d.variants = [variant({ patch: { dayOfWeek: 5 } })];
  assert.equal(resolveOccurrences(d, week(6), week(6)).length, 0);
  const friday = datePlus(week(6), 4);
  assert.equal(resolveOccurrences(d, friday, friday).length, 1);
});
test("DST keeps local teaching time and rejects gaps and ambiguous hours", () => {
  assert.equal(
    toUtc("2026-10-19", "09:00", "Europe/London"),
    "2026-10-19T08:00:00.000Z",
  );
  assert.equal(
    toUtc("2026-10-26", "09:00", "Europe/London"),
    "2026-10-26T09:00:00.000Z",
  );
  assert.throws(
    () => toUtc("2026-03-29", "01:30", "Europe/London"),
    /does not exist/,
  );
  assert.throws(
    () => toUtc("2026-10-25", "01:30", "Europe/London"),
    /occurs twice/,
  );
  assert.throws(() => parseWeeks("10-8"));
  assert.throws(() => parseWeeks("7", [6, 8]));
});
test("cross-zone overlaps use UTC and staff primary campus availability", () => {
  const d = fixture(),
    o = all(d)[0];
  const b = {
    ...o,
    id: "OTHER",
    seriesId: "OTHER",
    locationId: "R2",
    campusId: "NY",
    timeZone: "America/New_York",
    start: "04:30",
    end: "06:30",
    startAtUtc: toUtc(o.date!, "04:30", "America/New_York"),
    endAtUtc: toUtc(o.date!, "06:30", "America/New_York"),
  };
  assert(
    detectOccurrenceConflicts(d, [o, b]).some(
      (c) => c.type === "Staff double booking",
    ),
  );
  assert(resourceAvailable(d, b, "Lecturer", "L1"));
});
test("unavailable exceptions override weekly hours; available exceptions replace them", () => {
  const d = fixture(),
    o = all(d)[0];
  d.availabilityRules = [
    {
      id: "A",
      resourceType: "Lecturer",
      resourceId: "L1",
      timeZone: "Europe/London",
      days: [],
    },
  ];
  assert(!resourceAvailable(d, o, "Lecturer", "L1"));
  d.exceptions = [
    {
      id: "E",
      resourceType: "Lecturer",
      resourceId: "L1",
      resourceName: "Alex",
      timeZone: "Europe/London",
      startDate: o.date!,
      endDate: o.date!,
      startTime: "08:00",
      endTime: "20:00",
      availabilityType: "Available",
      reason: "Teaching",
      notes: "",
      createdAt: "",
    },
  ];
  assert(resourceAvailable(d, o, "Lecturer", "L1"));
  d.exceptions.push({
    ...d.exceptions[0],
    id: "E2",
    availabilityType: "Unavailable",
    startTime: "10:00",
    endTime: "11:00",
  });
  assert(!resourceAvailable(d, o, "Lecturer", "L1"));
});
test("capacity and explicit staff campus rights are never silently repaired", () => {
  const d = fixture();
  d.rooms[0].capacity = 0;
  const next = normaliseCampusData(d);
  assert.equal(next.rooms[0].capacity, 0);
  assert.deepEqual(next.lecturers[0].additionalCampuses, []);
  assert(
    detectOccurrenceConflicts(next, all(next)).some(
      (c) => c.type === "Capacity exceeded",
    ),
  );
});
test("referenced master records cannot be archived, including variant-only resources", () => {
  const d = fixture();
  assert.throws(() => assertArchive(d, "rooms", "R1"));
  d.variants = [variant({ patch: { locationId: "R2" } })];
  assert.throws(() => assertArchive(d, "rooms", "R2"));
  assert.throws(() => assertArchive(d, "programmes", "P1"));
});
test("shared revisions reject stale writers and assign server-generated IDs", () => {
  const d = fixture();
  let id = 0;
  const first = applyMutations(
    d,
    [
      {
        entity: "rooms",
        operation: "create",
        record: {
          id: "TEMP",
          room: "New",
          campus: "Birmingham",
          building: "Main",
          type: "Workshop",
          capacity: 20,
          status: "Available",
        },
      },
    ],
    1,
    "request",
    () => `UUID-${++id}`,
    "now",
  );
  assert.equal(first.changes[0].record.id, "UUID-1");
  assert.equal(first.data.dataRevision, 2);
  assert.throws(
    () =>
      applyMutations(
        first.data,
        [
          {
            entity: "rooms",
            operation: "update",
            id: "R1",
            expectedRevision: 1,
            record: { capacity: 40 },
          },
        ],
        1,
        "request2",
        () => "",
        "now",
      ),
    /STALE/,
  );
  assert.equal(d.rooms.length, 2);
});
test("publication requires approval, complete planning and no hard conflicts", () => {
  const d = fixture(),
    scope = {
      startDate: "2026-09-01",
      endDate: "2027-08-31",
      campusIds: ["BHM"],
      academicYearId: "AY-2026",
      notes: "Release",
      publishedBy: "Team",
    };
  assert(
    publicationReadiness(
      d,
      scope.startDate,
      scope.endDate,
      scope.campusIds,
      scope.academicYearId,
    ).ready,
  );
  assert.throws(() => makePublication(d, scope, () => "P", "now"), /Approve/);
  d.publication!.status = "Approved";
  const snap = makePublication(d, scope, () => "P", "now");
  d.rooms[0].capacity = 0;
  assert.equal(snap.data.rooms[0].capacity, 30);
  assert.throws(() => makePublication(d, scope, () => "P", "now"), /blocked/);
});
test("ICS includes stable occurrence UIDs and explicit IANA zones", () => {
  const text = timetableIcs(all());
  assert(text.includes("DTSTART;TZID=Europe/London:20261026T090000"));
  assert(text.includes("UID:SER-S1@2026-10-26@campus-timetable"));
  assert(text.endsWith("\r\n"));
});
test("import validates duplicates within file and missing campus references", () => {
  const d = fixture(),
    mapping = {
      room: "name",
      campus: "campus",
      capacity: "capacity",
      type: "type",
    };
  const rows = [
    { name: "New", campus: "Birmingham", capacity: "20", type: "Workshop" },
    { name: "New", campus: "Birmingham", capacity: "20", type: "Workshop" },
    { name: "Bad", campus: "Unknown", capacity: "20", type: "Workshop" },
  ];
  const result = previewImport(d, "rooms", rows, mapping);
  assert(!result[0].error);
  assert(result[1].error);
  assert(result[2].error);
});
test("planner adds only missing series and does not choose unsuitable rooms", () => {
  const d = fixture();
  assert.equal(planSchedule(d).mutations.length, 0);
  d.series = [];
  d.rooms.forEach((r) => (r.capacity = 0));
  const p = planSchedule(d);
  assert.equal(p.mutations.length, 0);
  assert(p.unscheduled.length);
  d.rooms[0].capacity = 30;
  const good = planSchedule(d);
  assert.equal(good.mutations.length, 1);
  assert.equal(good.mutations[0].record?.locationId, "R1");
});
