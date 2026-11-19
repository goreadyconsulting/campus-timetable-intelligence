import type { AppData, Session, Room } from "@/types";
import { DateTime } from "luxon";
import { datePlus, validDate, weekday, toUtc } from "./academic";

export type UsageTotals = {
  available: number; booked: number; known: number; occupiedEquivalent: number;
  outside: number; overlapping: number;
};
type Interval = { start: number; end: number };
type Booking = Interval & { occupancy: number | null };
export type UsageRow = UsageTotals & { name: string; campus: string; id: string };
export type UsageScope = {
  start: string; end: string; campus: string; academicYearId: string;
  roomId?: string; weekdaysOnly?: boolean;
};
const zero = (): UsageTotals => ({
  available: 0, booked: 0, known: 0, occupiedEquivalent: 0, outside: 0, overlapping: 0,
});
export function addUsage(a: UsageTotals, b: UsageTotals) {
  for (const key of Object.keys(a) as (keyof UsageTotals)[]) a[key] += b[key];
}
export function usageRates(t: UsageTotals) {
  const frequency = t.available > 0 ? t.booked / t.available : null;
  const occupancy = t.known > 0 ? t.occupiedEquivalent / t.known : null;
  const evidence = t.booked > 0 ? t.known / t.booked : null;
  return {
    frequency, occupancy, evidence,
    utilisation: frequency === null ? null : t.booked === 0 ? 0 :
      occupancy === null ? null : frequency * occupancy,
  };
}
export function isPhysicalLocation(room: Room) {
  // The current master schema has no explicit physical/virtual flag.
  return !/\b(online|virtual|remote)\b/i.test([room.campus, room.type, room.room].join(" "));
}
const intersect = (a: Interval, b: Interval): Interval | null => {
  const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
};
function subtract(a: Interval, b: Interval): Interval[] {
  const x = intersect(a, b);
  if (!x) return [a];
  return [
    { start: a.start, end: x.start },
    { start: x.end, end: a.end },
  ].filter((p) => p.end > p.start);
}
function window(date: string, start: string, end: string, zone: string): Interval {
  return { start: Date.parse(toUtc(date, start, zone)), end: Date.parse(toUtc(date, end, zone)) };
}
// Sweep the union of openings and bookings. Overlapping bookings count once for
// frequency and are excluded from occupancy evidence rather than guessing attendance.
export function measureUsage(available: Interval[], bookings: Booking[]): UsageTotals {
  const events = new Map<number, { availability: number; add: number[]; remove: number[] }>();
  const event = (t: number) => {
    let e = events.get(t);
    if (!e) { e = { availability: 0, add: [], remove: [] }; events.set(t, e); }
    return e;
  };
  for (const a of available) if (a.end > a.start) {
    event(a.start).availability++; event(a.end).availability--;
  }
  bookings.forEach((b, i) => {
    if (b.end > b.start) { event(b.start).add.push(i); event(b.end).remove.push(i); }
  });
  const totals = zero(), active = new Set<number>();
  let openings = 0, previous: number | undefined;
  for (const [time, e] of [...events].sort((a, b) => a[0] - b[0])) {
    const hours = previous === undefined ? 0 : (time - previous) / 3600000;
    if (openings > 0) {
      totals.available += hours;
      if (active.size > 0) {
        totals.booked += hours;
        if (active.size > 1) totals.overlapping += hours;
        else {
          const b = bookings[active.values().next().value!];
          if (b.occupancy !== null) {
            totals.known += hours;
            totals.occupiedEquivalent += hours * b.occupancy;
          }
        }
      }
    } else if (active.size > 0) totals.outside += hours;
    openings += e.availability;
    for (const i of e.remove) active.delete(i);
    for (const i of e.add) active.add(i);
    previous = time;
  }
  return totals;
}

export function locationUsage(data: AppData, sessions: Session[], scope: UsageScope) {
  if (!validDate(scope.start) || !validDate(scope.end) ||
      scope.start > scope.end || scope.end > datePlus(scope.start, 370))
    throw new Error("Select a valid reporting period of up to 370 days.");
  const year = data.academicYears?.find(y => y.id === scope.academicYearId && !y.archived);
  if (!year || scope.start < year.startDate || scope.end > year.endDate)
    throw new Error("Location utilisation dates must be within the selected academic year.");
  const campuses = new Map((data.campuses || []).filter(c => c.active && !c.archived).map(c => [c.name,c]));
  const inScope = data.rooms.filter(r => !r.archived && r.id && campuses.has(r.campus) &&
    (scope.campus === "All campuses" || r.campus === scope.campus) &&
    (!scope.roomId || r.id === scope.roomId));
  const rooms = inScope.filter(isPhysicalLocation);
  const selectedIds = new Set(rooms.map(r => r.id!));
  const byRoom = new Map<string, Session[]>();
  let excludedSessions = 0, invalidSessions = 0;
  for (const s of sessions) {
    if (s.status === "Cancelled" || s.academicYearId !== scope.academicYearId ||
        (scope.campus !== "All campuses" && s.campus !== scope.campus) ||
        (scope.roomId && s.locationId !== scope.roomId)) continue;
    if (!s.locationId || !selectedIds.has(s.locationId)) { excludedSessions++; continue; }
    const start = Date.parse(s.startAtUtc || ""), end = Date.parse(s.endAtUtc || "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) { invalidSessions++; continue; }
    const list = byRoom.get(s.locationId) || [];
    list.push(s); byRoom.set(s.locationId, list);
  }
  const total = zero(), rows: UsageRow[] = [], campusRows = new Map<string, UsageRow>(),
    months = new Map<string, UsageRow>();
  for (const room of rooms) {
    const campus = campuses.get(room.campus)!;
    const rule = data.availabilityRules?.find(r => !r.archived && r.resourceType === "Room" && r.resourceId === room.id);
    const exceptions = (data.exceptions || []).filter(e => !e.archived && e.resourceType === "Room" && e.resourceId === room.id);
    const byDate = new Map<string, Booking[]>();
    for (const s of byRoom.get(room.id!) || []) {
      const start = Date.parse(s.startAtUtc!), end = Date.parse(s.endAtUtc!);
      const localStart = DateTime.fromMillis(start, { zone: campus.timeZone });
      const localEnd = DateTime.fromMillis(end - 1, { zone: campus.timeZone });
      for (let d = localStart.toISODate()!; d <= localEnd.toISODate()!; d = datePlus(d, 1)) {
        if (d < scope.start || d > scope.end) continue;
        const dayStart = DateTime.fromISO(d, { zone: campus.timeZone }).toMillis();
        const dayEnd = DateTime.fromISO(datePlus(d, 1), { zone: campus.timeZone }).toMillis();
        const part = intersect({start, end}, {start: dayStart, end: dayEnd});
        if (!part) continue;
        const occupancy = Number.isFinite(room.capacity) && room.capacity > 0 &&
          Number.isFinite(s.enrolled) && s.enrolled > 0 ? s.enrolled / room.capacity : null;
        const items = byDate.get(d) || [];
        items.push({...part, occupancy}); byDate.set(d, items);
      }
    }
    const row = { ...zero(), id: room.id!, name: room.room, campus: room.campus };
    for (let d = scope.start; d <= scope.end; d = datePlus(d, 1)) {
      if (scope.weekdaysOnly && weekday(d) > 5) continue;
      const opening = window(d, campus.openingTime, campus.closingTime, campus.timeZone);
      let available: Interval[] = [];
      if (room.status !== "Maintenance" && opening.end > opening.start) {
        const zone = rule?.timeZone || campus.timeZone;
        const first = DateTime.fromMillis(opening.start, { zone }).toISODate()!;
        const last = DateTime.fromMillis(opening.end - 1, { zone }).toISODate()!;
        for (let rd = first; rd <= last; rd = datePlus(rd, 1)) {
          const dated = exceptions.filter(e => rd >= e.startDate && rd <= e.endDate);
          const extra = dated.filter(e => e.availabilityType === "Available");
          const regular = rule?.days.find(day => day.dayOfWeek === weekday(rd))?.windows || [];
          // Without a room-specific rule use campus openings, less dated closures.
          let pieces: Interval[] = extra.length || rule
            ? (extra.length ? extra.map(e => ({start:e.startTime,end:e.endTime})) : regular)
                .flatMap(w => { const x = intersect(opening, window(rd,w.start,w.end,zone)); return x ? [x] : []; })
            : [opening];
          for (const e of dated.filter(e => e.availabilityType === "Unavailable"))
            pieces = pieces.flatMap(p => subtract(p, window(rd,e.startTime,e.endTime,zone)));
          available.push(...pieces);
        }
      }
      const daily = measureUsage(available, byDate.get(d) || []);
      addUsage(row, daily);
      const month = d.slice(0, 7);
      const m = months.get(month) || {...zero(), id: month, name: month, campus: ""};
      addUsage(m, daily); months.set(month,m);
    }
    rows.push(row); addUsage(total,row);
    const c = campusRows.get(room.campus) || {...zero(), id: campus.id, name: room.campus, campus: room.campus};
    addUsage(c,row); campusRows.set(room.campus,c);
  }
  return {total, rows, campuses: [...campusRows.values()].sort((a,b)=>a.name.localeCompare(b.name)),
    months: [...months.values()].sort((a,b)=>a.id.localeCompare(b.id)),
    excludedRooms: inScope.length - rooms.length, excludedSessions, invalidSessions};
}
