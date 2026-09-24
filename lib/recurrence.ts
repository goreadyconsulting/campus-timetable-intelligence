import type { AppData, Session } from "@/types";
import type {
  ScheduleSeries,
  ScheduleVariant,
  TeachingWeek,
} from "@/types/scheduling";
import {
  calendarForYear,
  datePlus,
  days,
  monday,
  toUtc,
  weekday,
} from "./academic";
import { normaliseCampusData } from "./master-data";
import { createTemplatesFromData } from "./workflow";
export const priorities = {
  single_occurrence: 4,
  week_set: 3,
  date_range: 2,
  this_and_following: 1,
};
export function migrateData(input: AppData): AppData {
  if (input.schemaVersion === "5.0.0") return input;
  const data = normaliseCampusData(input),
    cal = calendarForYear();
  const names = [
    ...new Set(
      [
        ...data.rooms.map((r) => r.campus),
        ...data.modules.map((m) => m.campus || ""),
      ].filter(Boolean),
    ),
  ];
  data.campuses ??= names.map((name) => ({
    id:
      name === "Birmingham"
        ? "BHM"
        : name === "Manchester"
          ? "MAN"
          : `CAM-${name.replace(/\W/g, "").toUpperCase()}`,
    code: name.slice(0, 3).toUpperCase(),
    name,
    timeZone: "Europe/London",
    active: true,
    openingTime: "08:00",
    closingTime: "20:00",
    revision: 1,
  }));
  data.academicYears ??= [cal.year];
  data.terms ??= cal.terms;
  data.teachingWeeks ??= cal.weeks;
  data.modules = data.modules.map((m) => ({
    ...m,
    id: m.id || `MOD-${m.campus}-${m.code}`,
    revision: m.revision || 1,
  }));
  data.rooms = data.rooms.map((r) => ({
    ...r,
    id: r.id || `LOC-${r.campus}-${r.room}`,
    revision: r.revision || 1,
  }));
  data.lecturers = data.lecturers.map((l) => ({
    ...l,
    id: l.id || `STA-${l.name}`,
    revision: l.revision || 1,
  }));
  data.templates ??= createTemplatesFromData(data);
  data.templates = data.templates.map((t) => ({
    ...t,
    moduleId:
      t.moduleId ||
      data.modules.find((m) => m.code === t.moduleCode && m.campus === t.campus)
        ?.id,
    revision: t.revision || 1,
    academicYearId: t.academicYearId || cal.year.id,
    teachingWeeks: t.teachingWeeks.filter((n) =>
      data.teachingWeeks!.some(
        (w) =>
          w.academicYearId === (t.academicYearId || cal.year.id) &&
          w.weekNumber === n &&
          w.isTeachingWeek,
      ),
    ),
  }));
  data.exceptions ??= [];
  data.variants ??= [];
  data.availabilityRules ??= [];
  data.travelRules ??= [];
  data.conflictReviews ??= [];
  data.publications ??= [];
  data.audit ??= [];
  data.publication ??= {
    version: 0,
    status: "Draft",
    scope: "All campuses",
    notes: "",
    revision: 1,
    dataRevision: 1,
  };
  data.series ??= data.sessions.map((s) =>
    seriesFromSession(data, s, `SER-${s.id}`),
  );
  data.allocations ??= (data.students || []).flatMap((s) =>
    data.modules
      .filter((m) => m.campus === s.campus && s.moduleCodes.includes(m.code))
      .map((m) => ({
        id: `ALLOC-${s.id}-${m.id}`,
        studentId: s.id,
        moduleId: m.id!,
        startDate: cal.year.startDate,
        endDate: cal.year.endDate,
        status: "Active" as const,
        revision: 1,
      })),
  );
  for (const key of [
    "students",
    "programmes",
    "exceptions",
    "templates",
  ] as const) {
    (data as any)[key] = (data[key] || []).map((r) => ({
      ...r,
      revision: r.revision || 1,
    }));
  }
  data.schemaVersion = "5.0.0";
  data.dataRevision ??= 1;
  return data;
}
export function seriesFromSession(
  data: AppData,
  session: Session,
  id = "",
): ScheduleSeries {
  const module = data.modules.find(
      (m) => m.code === session.moduleCode && m.campus === session.campus,
    ),
    campus = data.campuses?.find((c) => c.name === session.campus),
    template = data.templates?.find(
      (t) =>
        t.moduleCode === session.moduleCode &&
        t.campus === session.campus &&
        !t.archived,
    );
  const year =
    data.academicYears?.find((y) =>
      session.date
        ? session.date >= y.startDate && session.date <= y.endDate
        : y.id === template?.academicYearId,
    ) || data.academicYears?.[0];
  if (!campus || !year)
    throw new Error("Set up the campus and academic year before scheduling.");
  const weeks = (data.teachingWeeks || []).filter(
      (w) => w.academicYearId === year.id && w.isTeachingWeek,
    ),
    now = new Date().toISOString();
  return {
    id,
    campusId: campus.id,
    moduleId: module?.id || "",
    programmeId: module?.programmeId || "",
    activityTemplateId: template?.id,
    academicYearId: year.id,
    dayOfWeek: session.date
      ? weekday(session.date)
      : days.indexOf(session.day) + 1,
    startLocalTime: session.start,
    endLocalTime: session.end,
    timeZone: campus.timeZone,
    startDate: session.date || year.startDate,
    endDate: session.date || year.endDate,
    teachingWeeks: session.date
      ? weeks
          .filter(
            (w) => session.date! >= w.startDate && session.date! <= w.endDate,
          )
          .map((w) => w.weekNumber)
      : template?.teachingWeeks || weeks.map((w) => w.weekNumber),
    staffIds: data.lecturers
      .filter((l) => l.name === session.lecturer)
      .map((l) => l.id!),
    locationId:
      data.rooms.find(
        (r) => r.room === session.room && r.campus === session.campus,
      )?.id || "",
    studentIds: session.studentIds || [],
    plannedSize: Math.max(session.enrolled, session.studentIds?.length || 0),
    status: session.status === "Cancelled" ? "Cancelled" : "Scheduled",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    legacySessionId: session.id,
  };
}
export function baseDates(series: ScheduleSeries, weeks: TeachingWeek[]) {
  return weeks
    .filter(
      (w) =>
        !w.archived &&
        w.academicYearId === series.academicYearId &&
        w.isTeachingWeek &&
        series.teachingWeeks.includes(w.weekNumber),
    )
    .map((week) => ({
      week,
      date: datePlus(monday(week.startDate), series.dayOfWeek - 1),
    }))
    .filter((d) => d.date >= series.startDate && d.date <= series.endDate);
}
export function variantApplies(v: ScheduleVariant, date: string, week: number) {
  if (v.archived) return false;
  if (v.scope === "single_occurrence") return v.effectiveDate === date;
  if (v.scope === "week_set") return v.teachingWeeks?.includes(week) || false;
  if (v.scope === "date_range")
    return Boolean(
      v.startDate && v.endDate && date >= v.startDate && date <= v.endDate,
    );
  return Boolean(v.effectiveDate && date >= v.effectiveDate);
}
export function variantDates(
  s: ScheduleSeries,
  v: ScheduleVariant,
  weeks: TeachingWeek[],
) {
  return baseDates(s, weeks).filter((d) =>
    variantApplies(v, d.date, d.week.weekNumber),
  );
}
export function assertNoVariantOverlap(
  s: ScheduleSeries,
  v: ScheduleVariant,
  data: AppData,
) {
  const dates = variantDates(s, v, data.teachingWeeks || []);
  if (!dates.length)
    throw new Error("The change affects no teaching occurrences.");
  if (v.operation === "additional_session") return;
  const overlap = data.variants?.find(
    (a) =>
      a.id !== v.id &&
      a.seriesId === s.id &&
      !a.archived &&
      a.operation !== "additional_session" &&
      priorities[a.scope] === priorities[v.scope] &&
      dates.some((d) => variantApplies(a, d.date, d.week.weekNumber)),
  );
  if (overlap)
    throw new Error(
      "A variant with the same priority already affects these occurrences. Edit or revert that variant first.",
    );
}
export function resolveOccurrences(
  data: AppData,
  start: string,
  end: string,
  includeCancelled = false,
): Session[] {
  const result: Session[] = [];
  const grouped = new Map<string, ScheduleVariant[]>();
  for (const v of data.variants || [])
    if (!v.archived)
      grouped.set(v.seriesId, [...(grouped.get(v.seriesId) || []), v]);
  for (const s of data.series || []) {
    if (s.archived) continue;
    const campus = data.campuses?.find((c) => c.id === s.campusId),
      module = data.modules.find((m) => m.id === s.moduleId),
      programme = data.programmes?.find((p) => p.id === s.programmeId);
    for (const { week, date } of baseDates(s, data.teachingWeeks || []).filter(
      (d) => d.date >= datePlus(start, -7) && d.date <= datePlus(end, 7),
    )) {
      const variants = (grouped.get(s.id) || []).filter((v) =>
        variantApplies(v, date, week.weekNumber),
      );
      const overrides = variants
        .filter((v) => v.operation !== "additional_session")
        .sort(
          (a, b) =>
            priorities[b.scope] - priorities[a.scope] ||
            a.id.localeCompare(b.id),
        );
      if (
        overrides.length > 1 &&
        priorities[overrides[0].scope] === priorities[overrides[1].scope]
      )
        throw new Error(
          `Overlapping variants require review for ${module?.code || s.id}, Week ${week.weekNumber}.`,
        );
      for (const v of [
        overrides[0],
        ...variants.filter((v) => v.operation === "additional_session"),
      ]) {
        const effective = { ...s, ...v?.patch };
        const cancelled = s.status === "Cancelled" || v?.operation === "cancel";
        if (cancelled && !includeCancelled) continue;
        const dateCurrent = datePlus(monday(date), effective.dayOfWeek - 1);
        if (dateCurrent < start || dateCurrent > end) continue;
        const room = data.rooms.find((r) => r.id === effective.locationId),
          staff = data.lecturers.filter((l) =>
            effective.staffIds.includes(l.id || ""),
          );
        result.push({
          id: `${s.id}@${date}${v?.operation === "additional_session" ? `+${v.id}` : ""}`,
          seriesId: s.id,
          variantId: v?.id,
          source: v ? "Variant" : "Base",
          originalDate: date,
          date: dateCurrent,
          day: days[effective.dayOfWeek - 1],
          teachingWeek: week.weekNumber,
          academicYearId: s.academicYearId,
          campusId: s.campusId,
          campus: campus?.name || s.campusId,
          moduleId: s.moduleId,
          moduleCode: module?.code || s.moduleId,
          moduleName: module?.name || s.moduleId,
          course: programme?.code || module?.course || "",
          group: module?.studentGroup || "",
          start: effective.startLocalTime,
          end: effective.endLocalTime,
          timeZone: s.timeZone,
          startAtUtc: toUtc(dateCurrent, effective.startLocalTime, s.timeZone),
          endAtUtc: toUtc(dateCurrent, effective.endLocalTime, s.timeZone),
          staffIds: effective.staffIds,
          lecturer: staff.map((l) => l.name).join(", "),
          locationId: effective.locationId,
          room: room?.room || effective.locationId,
          studentIds: effective.studentIds,
          enrolled: Math.max(s.plannedSize, effective.studentIds.length),
          capacity: room?.capacity || 0,
          recurring: s.startDate !== s.endDate,
          status: cancelled ? "Cancelled" : v?.status || s.status,
          base: {
            dayOfWeek: s.dayOfWeek,
            startLocalTime: s.startLocalTime,
            endLocalTime: s.endLocalTime,
            locationId: s.locationId,
            staffIds: s.staffIds,
            studentIds: s.studentIds,
          },
        });
      }
    }
  }
  return result.sort(
    (a, b) =>
      a.startAtUtc!.localeCompare(b.startAtUtc!) || a.id.localeCompare(b.id),
  );
}
