import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture";
import {
  compareClasses,
  editedPatch,
  occurrencePatch,
  seriesOccurrences,
} from "../lib/change-review";
import type { ScheduleVariant } from "../types/scheduling";

function change(
  seriesId: string,
  fields: Partial<ScheduleVariant>,
): ScheduleVariant {
  return {
    id: "V1",
    seriesId,
    scope: "single_occurrence",
    effectiveDate: "2026-10-26",
    operation: "override",
    patch: { startLocalTime: "13:00", endLocalTime: "15:00" },
    status: "Draft",
    reason: "Test change",
    createdAt: "2026-10-01T00:00:00Z",
    ...fields,
  };
}

test("change review counts actual changes and respects higher-priority exceptions", () => {
  const before = fixture(),
    id = before.series![0].id;
  before.variants = [change(id, {})];
  const after = structuredClone(before);
  after.variants!.push(
    change(id, {
      id: "V2",
      scope: "week_set",
      teachingWeeks: [6, 8],
      patch: { locationId: "R2" },
    }),
  );
  const rows = compareClasses(before, after, id);
  assert.deepEqual(
    rows.map((r) => r.week),
    [8],
  );
  assert.equal(rows[0].before!.room, "Workshop 1");
  assert.equal(rows[0].after!.room, "Workshop 2");
  assert.equal(rows[0].after!.start, "09:00");
});

test("weekday changes pair each existing class with its new date", () => {
  const before = fixture(),
    after = structuredClone(before),
    id = before.series![0].id;
  after.series![0].dayOfWeek = 2;
  const rows = compareClasses(before, after, id);
  assert.equal(rows.length, seriesOccurrences(before, id).length);
  assert(
    rows.every((r) => r.before?.day === "Monday" && r.after?.day === "Tuesday"),
  );
});

test("revert preview includes cancelled classes and distinguishes removed extra classes", () => {
  const original = fixture(),
    cancelled = structuredClone(original),
    id = original.series![0].id;
  cancelled.variants = [change(id, { operation: "cancel", patch: {} })];
  const restored = compareClasses(cancelled, original, id);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].before!.status, "Cancelled");
  assert.equal(restored[0].after!.status, "Scheduled");
  const extra = structuredClone(original);
  extra.variants = [change(id, { operation: "additional_session" })];
  const removed = compareClasses(extra, original, id);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].after, undefined);
  assert.equal(removed[0].before!.start, "13:00");
});

test("a repeating-pattern room edit does not copy the selected date's time exception", () => {
  const before = fixture(),
    id = before.series![0].id;
  before.variants = [change(id, {})];
  const selected = seriesOccurrences(before, id).find(
    (o) => o.teachingWeek === 6,
  )!;
  const patch = editedPatch(occurrencePatch(selected), {
    ...occurrencePatch(selected),
    locationId: "R2",
  });
  assert.deepEqual(patch, { locationId: "R2" });
  const after = structuredClone(before);
  Object.assign(after.series![0], patch);
  const rows = compareClasses(before, after, id);
  assert(rows.every((r) => r.before!.start === r.after!.start));
  assert.equal(
    seriesOccurrences(after, id).find((o) => o.teachingWeek === 6)!.start,
    "13:00",
  );
});
