import { DateTime, IANAZone } from "luxon";
import type { AcademicYear, Term, TeachingWeek } from "@/types/scheduling";
export const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const validDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && DateTime.fromISO(v, { zone: "UTC" }).isValid;
export const validTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const validZone = (v: string) => IANAZone.isValidZone(v);
export const datePlus = (v: string, n: number) =>
  DateTime.fromISO(v, { zone: "UTC" }).plus({ days: n }).toISODate()!;
export const monday = (v: string) =>
  DateTime.fromISO(v, { zone: "UTC" }).startOf("week").toISODate()!;
export const weekday = (v: string) =>
  DateTime.fromISO(v, { zone: "UTC" }).weekday;
export const campusToday = (zone = "Europe/London") =>
  DateTime.now().setZone(zone).toISODate()!;
export function toUtc(date: string, time: string, zone: string) {
  if (!validDate(date) || !validTime(time) || !validZone(zone))
    throw new Error("Enter a valid date, time and IANA time zone.");
  const local = DateTime.fromISO(`${date}T${time}`, { zone });
  if (
    !local.isValid ||
    local.toFormat("yyyy-MM-dd HH:mm") !== `${date} ${time}`
  )
    throw new Error(
      "This local time does not exist because the clocks change.",
    );
  if (local.getPossibleOffsets().length > 1)
    throw new Error(
      "This local time occurs twice because the clocks change. Choose an unambiguous time.",
    );
  return local.toUTC().toISO()!;
}
export function parseWeeks(value: string, allowed?: number[]) {
  const result = new Set<number>();
  if (!value.trim()) return [];
  for (const part of value.split(",")) {
    const m = part.trim().match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/);
    if (!m) throw new Error("Use weeks such as 8-10, 13, 15.");
    const a = Number(m[1]),
      b = Number(m[2] || m[1]);
    if (a < 1 || b > 53 || b < a)
      throw new Error("Week ranges must run forwards between 1 and 53.");
    for (let n = a; n <= b; n++) {
      if (allowed && !allowed.includes(n))
        throw new Error(`Week ${n} is not an available teaching week.`);
      result.add(n);
    }
  }
  return [...result].sort((a, b) => a - b);
}
export function calendarForYear(n = 2026) {
  const year: AcademicYear = {
    id: `AY-${n}`,
    name: `${n}/${String(n + 1).slice(-2)}`,
    startDate: `${n}-09-01`,
    endDate: `${n + 1}-08-31`,
    revision: 1,
  };
  const first = monday(`${n}-09-21`);
  const terms: Term[] = [
    ["AUT", "Autumn", 0, 90],
    ["SPR", "Spring", 112, 202],
    ["SUM", "Summer", 224, 286],
  ].map(([id, name, a, b]) => ({
    id: `${year.id}-${id}`,
    academicYearId: year.id,
    name: String(name),
    startDate: datePlus(first, Number(a)),
    endDate: datePlus(first, Number(b)),
    revision: 1,
  }));
  const weeks: TeachingWeek[] = [];
  for (let i = 0; i < 50; i++) {
    const startDate = datePlus(first, i * 7),
      endDate = datePlus(startDate, 6);
    if (endDate > year.endDate) break;
    const term = terms.find(
      (t) => startDate >= t.startDate && startDate <= t.endDate,
    );
    const reading = [6, 22].includes(i),
      exams = i >= 37 && i <= 40;
    weeks.push({
      id: `${year.id}-W${i + 1}`,
      academicYearId: year.id,
      termId: term?.id,
      weekNumber: i + 1,
      startDate,
      endDate,
      isTeachingWeek: Boolean(term) && !reading && !exams,
      label: reading
        ? "Reading week"
        : exams
          ? "Examinations"
          : term
            ? "Teaching"
            : "Holiday",
      revision: 1,
    });
  }
  return { year, terms, weeks };
}
