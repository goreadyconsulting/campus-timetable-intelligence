import { test } from "node:test";
import assert from "node:assert/strict";
import { demoProfiles, syntheticTimetable } from "../data/synthetic";
import { resolveOccurrences } from "../lib/recurrence";
import { detectOccurrenceConflicts } from "../lib/constraints";
test("small dataset preserves individual allocations, recurrence and scoped change",()=>{
  const data=syntheticTimetable("small");
  const y=data.academicYears![0];
  const occurrences=resolveOccurrences(data,y.startDate,y.endDate);
  assert.equal(occurrences.length,500);
  assert.equal(data.sessions.length,0);
  assert.equal(data.conflicts.length,0);
  assert.equal(occurrences.filter(o=>o.variantId==="SYN-V1").length,1);
  assert.ok(new Set(occurrences.map(s=>s.date?.slice(0,7))).size>3);
  assert.ok(occurrences.every(o=>o.studentIds?.length));
  assert.equal(detectOccurrenceConflicts(data,occurrences).filter(c=>c.severity==="Critical" || c.severity==="High").length,0);
});
test("synthetic profiles generate the target number of occurrences without flat session records",()=>{
  for(const profile of ["demonstration","institutional"] as const){
    const data=syntheticTimetable(profile);
    assert.equal(data.series!.reduce((n,s)=>n+s.teachingWeeks.length,0),demoProfiles[profile].occurrences);
    assert.equal(data.sessions.length,0);
    assert.equal(data.conflicts.length,0);
  }
});
