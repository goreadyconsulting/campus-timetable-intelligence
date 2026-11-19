import { test } from "node:test";
import assert from "node:assert/strict";
import { locationUsage, measureUsage, usageRates } from "../lib/location-usage";
import { fixture } from "./fixture";
import { resolveOccurrences } from "../lib/recurrence";

const h = 3600000;
test("frequency counts unique booked room-hours and idle capacity", () => {
  const t = measureUsage([{start:0,end:8*h}], [
    {start:0,end:2*h,occupancy:0.5}, {start:2*h,end:4*h,occupancy:0.5},
  ]);
  assert.equal(usageRates(t).frequency, 0.5);
  assert.equal(usageRates(t).occupancy, 0.5);
  assert.equal(usageRates(t).utilisation, 0.25);
});
test("overlap, zero-size evidence and booking outside availability are not double counted", () => {
  const t = measureUsage([{start:h,end:5*h}], [
    {start:0,end:3*h,occupancy:0.5},
    {start:2*h,end:4*h,occupancy:0.75},
    {start:4*h,end:5*h,occupancy:null},
  ]);
  assert.equal(t.available,4); assert.equal(t.booked,4); assert.equal(t.outside,1);
  assert.equal(t.overlapping,1); assert.equal(t.known,2);
  assert.equal(usageRates(t).occupancy,0.625);
  assert.equal(usageRates(t).evidence,0.5);
});
test("an empty room has zero frequency and utilisation, unknown occupancy", () => {
  const rates = usageRates(measureUsage([{start:0,end:h}],[]));
  assert.deepEqual(rates,{frequency:0,occupancy:null,evidence:null,utilisation:0});
});
test("a closed room has no valid frequency or utilisation denominator", () => {
  const rates = usageRates(measureUsage([],[]));
  assert.equal(rates.frequency,null); assert.equal(rates.utilisation,null);
});
test("resolved room usage respects closures, cancellation and online exclusion", () => {
  const data = fixture();
  const campus = data.campuses!.find(c=>c.name==="Birmingham")!;
  campus.openingTime="08:00"; campus.closingTime="16:00";
  const scope = {start:"2026-10-26",end:"2026-10-26",campus:"Birmingham",academicYearId:data.academicYears![0].id};
  data.rooms.push({...data.rooms[0],id:"ONLINE",room:"Virtual classroom"});
  const base=resolveOccurrences(data,scope.start,scope.end)[0];
  assert.ok(base);
  data.exceptions=[{id:"X1",resourceType:"Room",resourceId:"R1",resourceName:"Workshop 1",timeZone:campus.timeZone,
    startDate:scope.start,endDate:scope.end,startTime:"08:00",endTime:"10:00",availabilityType:"Unavailable",reason:"Maintenance",notes:"",createdAt:"2026-10-01T00:00:00Z"}];
  const result=locationUsage(data,[{...base,enrolled:15},{...base,id:"cancelled",status:"Cancelled"},{...base,id:"online",locationId:"ONLINE"}],scope);
  assert.equal(result.rows.length,2);assert.equal(result.excludedRooms,1);assert.equal(result.excludedSessions,1);
  assert.equal(result.total.available,14);assert.equal(result.total.booked,1);assert.equal(result.total.outside,1);
  assert.equal(usageRates(result.total).occupancy,0.5);
});
