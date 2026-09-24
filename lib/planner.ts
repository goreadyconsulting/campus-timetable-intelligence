import type { AppData } from "@/types";
import type { ScheduleSeries, Mutation } from "@/types/scheduling";
import { assertRecord } from "./validation";
import {
  detectOccurrenceConflicts,
  minutes,
  roomTypeMatches,
} from "./constraints";
import { resolveOccurrences } from "./recurrence";
import { staffCanTeachAtCampus } from "./master-data";
import { days } from "./academic";
export function planSchedule(input: AppData) {
  const data = JSON.parse(JSON.stringify(input)) as AppData;
  const mutations: Mutation[] = [];
  const unscheduled: string[] = [];
  for (const t of data.templates || []) {
    if (t.archived) continue;
    try {
      assertRecord(data, "templates", t);
    } catch (e) {
      unscheduled.push(`${t.name}: ${(e as Error).message}`);
      continue;
    }
    const campus = data.campuses!.find((c) => c.name === t.campus)!,
      module = data.modules.find((m) => m.id === t.moduleId)!,
      year = data.academicYears!.find((y) => y.id === t.academicYearId)!;
    for (let ordinal = 0; ordinal < t.weeklySessions; ordinal++) {
      const weeks = t.teachingWeeks.filter(
        (w) =>
          (data.series || []).filter(
            (s) =>
              !s.archived &&
              s.status !== "Cancelled" &&
              s.activityTemplateId === t.id &&
              s.teachingWeeks.includes(w),
          ).length <= ordinal,
      );
      if (!weeks.length) continue;
      const staff = data.lecturers.filter(
        (l) =>
          !l.archived &&
          staffCanTeachAtCampus(l, t.campus) &&
          (l.modules.includes(t.moduleCode) ||
            module.lecturerId === l.id ||
            !t.lecturerSuitability),
      );
      const rooms = data.rooms
        .filter(
          (r) =>
            !r.archived &&
            r.status !== "Maintenance" &&
            r.campus === t.campus &&
            r.capacity >= Math.max(t.plannedSize, t.studentIds?.length || 0) &&
            roomTypeMatches(r.type, t.roomSuitability),
        )
        .sort((a, b) => a.capacity - b.capacity);
      const orderedDays = [1, 2, 3, 4, 5]
        .filter(
          (n) =>
            !String(t.avoidedDays || "")
              .toLowerCase()
              .includes(days[n - 1].slice(0, 3).toLowerCase()),
        )
        .sort(
          (a, b) =>
            Number(t.preferredDays.includes(days[b - 1].slice(0, 3))) -
            Number(t.preferredDays.includes(days[a - 1].slice(0, 3))),
        );
      let found: ScheduleSeries | undefined;
      const existing = resolveOccurrences(data, year.startDate, year.endDate);
      outer: for (const day of orderedDays)
        for (
          let minute = minutes(campus.openingTime);
          minute + t.durationHours * 60 <= minutes(campus.closingTime);
          minute += 30
        )
          for (const l of staff)
            for (const r of rooms) {
              const time = (n: number) =>
                `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
              const candidate: ScheduleSeries = {
                id: `TEMP-${t.id}-${ordinal}`,
                campusId: campus.id,
                programmeId: module.programmeId!,
                moduleId: module.id!,
                academicYearId: year.id,
                activityTemplateId: t.id,
                dayOfWeek: day,
                startLocalTime: time(minute),
                endLocalTime: time(minute + t.durationHours * 60),
                timeZone: campus.timeZone,
                startDate: year.startDate,
                endDate: year.endDate,
                teachingWeeks: weeks,
                staffIds: [l.id!],
                locationId: r.id!,
                studentIds: t.studentIds || [],
                plannedSize: t.plannedSize,
                status: "Scheduled",
                createdAt: new Date().toISOString(),
              };
              const next = {
                ...data,
                series: [...(data.series || []), candidate],
              };
              const occurrences = resolveOccurrences(
                { ...next, series: [candidate] },
                year.startDate,
                year.endDate,
              );
              const hard = detectOccurrenceConflicts(next, [
                ...existing,
                ...occurrences,
              ]).some(
                (c) =>
                  c.seriesIds?.includes(candidate.id) &&
                  ["Critical", "High"].includes(c.severity),
              );
              const maxHours = l.maxWeeklyHours || 18;
              const overloaded = weeks.some(
                (w) =>
                  [...existing, ...occurrences]
                    .filter(
                      (o) =>
                        o.teachingWeek === w && o.staffIds?.includes(l.id!),
                    )
                    .reduce(
                      (n, o) => n + (minutes(o.end) - minutes(o.start)) / 60,
                      0,
                    ) > maxHours,
              );
              if (!hard && !overloaded) {
                found = candidate;
                break outer;
              }
            }
      if (found) {
        data.series!.push(found);
        mutations.push({
          entity: "series",
          operation: "create",
          record: found,
          reason: "Place planned teaching",
        });
      } else
        unscheduled.push(
          `${t.name}: no suitable allocation for weeks ${weeks.join(", ")}`,
        );
    }
  }
  return { mutations, unscheduled, data };
}
