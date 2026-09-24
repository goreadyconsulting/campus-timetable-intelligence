import type { AppData } from "@/types";
import type {
  EntityName,
  ScheduleSeries,
  ScheduleVariant,
} from "@/types/scheduling";
import {
  validDate,
  validTime,
  validZone,
  toUtc,
  datePlus,
  weekday,
} from "./academic";
import {
  assertNoVariantOverlap,
  baseDates,
  resolveOccurrences,
} from "./recurrence";
export const entities: EntityName[] = [
  "rooms",
  "lecturers",
  "students",
  "programmes",
  "modules",
  "templates",
  "exceptions",
  "campuses",
  "academicYears",
  "terms",
  "teachingWeeks",
  "series",
  "variants",
  "availabilityRules",
  "travelRules",
  "allocations",
  "conflictReviews",
];
export function records(data: AppData, entity: EntityName): any[] {
  return (data[entity] || []) as any[];
}
function requireValue(test: unknown, message: string): asserts test {
  if (!test) throw new Error(message);
}
export function assertRecord(data: AppData, entity: EntityName, r: any) {
  const ref = (e: EntityName, id: string) =>
    records(data, e).find((x) => x.id === id && !x.archived);
  const campus = (name: string) =>
    records(data, "campuses").find(
      (x) => x.name === name && x.active && !x.archived,
    );
  const range = () =>
    requireValue(
      validDate(r.startDate) &&
        validDate(r.endDate) &&
        r.startDate <= r.endDate,
      "Enter a valid ordered date range.",
    );
  const times = (a: string, b: string) =>
    requireValue(
      validTime(a) && validTime(b) && a < b,
      "End time must be later than start time.",
    );
  requireValue(r.id, "A permanent record ID is required.");
  if (r.archived) return;
  if (
    ["rooms", "students", "programmes", "modules", "templates"].includes(entity)
  )
    requireValue(campus(r.campus), "Choose an active campus.");
  if (
    [
      "students",
      "programmes",
      "modules",
      "lecturers",
      "campuses",
      "academicYears",
      "terms",
      "templates",
    ].includes(entity)
  )
    requireValue(String(r.name || "").trim(), "Name is required.");
  if (entity === "rooms") {
    requireValue(
      r.room && r.type && Number.isInteger(r.capacity) && r.capacity > 0,
      "Location name, type and positive capacity are required.",
    );
    requireValue(
      !records(data, entity).some(
        (x) =>
          x.id !== r.id &&
          !x.archived &&
          x.campus === r.campus &&
          x.room === r.room,
      ),
      "A location with this name already exists on this campus.",
    );
  }
  if (entity === "campuses") {
    requireValue(validZone(r.timeZone), "Use a valid IANA time zone.");
    times(r.openingTime, r.closingTime);
    requireValue(
      !records(data, entity).some(
        (x) => x.id !== r.id && (x.code === r.code || x.name === r.name),
      ),
      "Campus code and name must be unique.",
    );
  }
  if (entity === "lecturers") {
    requireValue(campus(r.primaryCampus), "Choose the primary campus.");
    requireValue(
      Array.isArray(r.additionalCampuses) &&
        r.additionalCampuses.every(
          (c: string) => campus(c) && c !== r.primaryCampus,
        ),
      "Additional campuses must be explicitly selected.",
    );
    requireValue(Number(r.maxWeeklyHours) > 0, "Enter maximum weekly hours.");
  }
  if (entity === "programmes" || entity === "modules") {
    requireValue(r.code, "Code is required.");
    requireValue(
      !records(data, entity).some(
        (x) =>
          x.id !== r.id &&
          !x.archived &&
          x.code === r.code &&
          x.campus === r.campus,
      ),
      "This code already exists on the campus.",
    );
  }
  if (entity === "modules" || entity === "students") {
    const p = ref("programmes", r.programmeId);
    requireValue(
      p && p.campus === r.campus,
      "Choose a programme on the same campus.",
    );
  }
  if (entity === "students")
    requireValue(
      Array.isArray(r.moduleCodes) &&
        r.moduleCodes.every((code: string) =>
          data.modules.some(
            (m) =>
              !m.archived &&
              m.campus === r.campus &&
              m.programmeId === r.programmeId &&
              m.code === code,
          ),
        ),
      "Student modules must belong to the selected programme and campus.",
    );
  if (
    entity === "academicYears" ||
    entity === "terms" ||
    entity === "teachingWeeks"
  ) {
    range();
    if (entity !== "academicYears") {
      const y = ref("academicYears", r.academicYearId);
      requireValue(
        y && r.startDate >= y.startDate && r.endDate <= y.endDate,
        "Dates must fall inside the academic year.",
      );
    }
    if (entity === "teachingWeeks") {
      requireValue(
        Number.isInteger(r.weekNumber) &&
          r.weekNumber > 0 &&
          r.weekNumber <= 53,
        "Invalid teaching week number.",
      );
      requireValue(
        weekday(r.startDate) === 1 && datePlus(r.startDate, 6) === r.endDate,
        "A teaching week must run from Monday through Sunday.",
      );
      requireValue(
        !records(data, entity).some(
          (w) =>
            w.id !== r.id &&
            !w.archived &&
            w.academicYearId === r.academicYearId &&
            (w.weekNumber === r.weekNumber ||
              (w.startDate <= r.endDate && w.endDate >= r.startDate)),
        ),
        "Teaching weeks must not overlap or repeat numbers.",
      );
      if (r.termId)
        requireValue(
          ref("terms", r.termId)?.academicYearId === r.academicYearId,
          "Choose a term in this academic year.",
        );
    }
  }
  if (entity === "series") {
    range();
    times(r.startLocalTime, r.endLocalTime);
    requireValue(validZone(r.timeZone), "Invalid series time zone.");
    const c = ref("campuses", r.campusId),
      m = ref("modules", r.moduleId),
      p = ref("programmes", r.programmeId),
      y = ref("academicYears", r.academicYearId);
    requireValue(
      c &&
        m &&
        p &&
        m.campus === c.name &&
        p.campus === c.name &&
        m.programmeId === p.id,
      "Series campus, module and programme must agree.",
    );
    requireValue(
      r.timeZone === c.timeZone,
      "Series must use the campus time zone.",
    );
    requireValue(
      y && r.startDate >= y.startDate && r.endDate <= y.endDate,
      "Series dates must fall inside its academic year.",
    );
    requireValue(
      Number.isInteger(r.dayOfWeek) && r.dayOfWeek >= 1 && r.dayOfWeek <= 7,
      "Choose a day.",
    );
    requireValue(
      Array.isArray(r.teachingWeeks) &&
        r.teachingWeeks.length &&
        r.teachingWeeks.every((n: number) =>
          data.teachingWeeks?.some(
            (w) =>
              !w.archived &&
              w.academicYearId === r.academicYearId &&
              w.weekNumber === n &&
              w.isTeachingWeek,
          ),
        ),
      "Select actual teaching weeks.",
    );
    requireValue(
      ref("rooms", r.locationId) &&
        Array.isArray(r.staffIds) &&
        r.staffIds.length &&
        r.staffIds.every((id: string) => ref("lecturers", id)),
      "Select a location and staff.",
    );
    requireValue(
      Array.isArray(r.studentIds) &&
        r.studentIds.length &&
        r.studentIds.every((id: string) => ref("students", id)),
      "Select individual students.",
    );
    requireValue(
      Number.isInteger(r.plannedSize) && r.plannedSize > 0,
      "Enter planned size.",
    );
    if (r.activityTemplateId)
      requireValue(
        ref("templates", r.activityTemplateId)?.moduleId === r.moduleId,
        "Template must belong to the series module.",
      );
    baseDates(r, data.teachingWeeks || []).forEach(({ date }) => {
      toUtc(date, r.startLocalTime, r.timeZone);
      toUtc(date, r.endLocalTime, r.timeZone);
    });
  }
  if (entity === "variants") {
    const s = ref("series", r.seriesId) as ScheduleSeries;
    requireValue(s, "Series is missing or archived.");
    requireValue(
      [
        "single_occurrence",
        "week_set",
        "date_range",
        "this_and_following",
      ].includes(r.scope),
      "Invalid change scope.",
    );
    requireValue(
      ["override", "cancel", "additional_session"].includes(r.operation),
      "Invalid operation.",
    );
    requireValue(String(r.reason || "").trim(), "A reason is required.");
    requireValue(
      r.patch &&
        Object.keys(r.patch).every((k) =>
          [
            "dayOfWeek",
            "startLocalTime",
            "endLocalTime",
            "locationId",
            "staffIds",
            "studentIds",
          ].includes(k),
        ),
      "Invalid override field.",
    );
    if (r.scope === "single_occurrence" || r.scope === "this_and_following")
      requireValue(validDate(r.effectiveDate), "Select an occurrence date.");
    if (r.scope === "date_range") range();
    if (r.scope === "week_set")
      requireValue(
        r.teachingWeeks?.length &&
          r.teachingWeeks.every((n: number) => s.teachingWeeks.includes(n)),
        "Select weeks in the series.",
      );
    const merged = { ...s, ...r.patch };
    times(merged.startLocalTime, merged.endLocalTime);
    requireValue(
      merged.dayOfWeek >= 1 && merged.dayOfWeek <= 7,
      "Invalid day.",
    );
    requireValue(ref("rooms", merged.locationId), "Invalid location.");
    requireValue(
      merged.staffIds.length &&
        merged.staffIds.every((id: string) => ref("lecturers", id)),
      "Invalid staff.",
    );
    requireValue(
      merged.studentIds.length &&
        merged.studentIds.every((id: string) => ref("students", id)),
      "Invalid students.",
    );
    assertNoVariantOverlap(s, r as ScheduleVariant, data);
    resolveOccurrences(
      {
        ...data,
        variants: [...(data.variants || []).filter((v) => v.id !== r.id), r],
      },
      s.startDate,
      s.endDate,
    );
  }
  if (entity === "templates") {
    const m = ref("modules", r.moduleId);
    requireValue(m && m.campus === r.campus, "Choose the campus module.");
    requireValue(
      ref("academicYears", r.academicYearId),
      "Choose an academic year.",
    );
    requireValue(
      r.durationHours > 0 &&
        r.durationHours <= 12 &&
        Number.isInteger(r.weeklySessions) &&
        r.weeklySessions > 0 &&
        r.plannedSize > 0,
      "Enter duration, weekly sessions and size.",
    );
    requireValue(
      r.teachingWeeks?.length &&
        r.teachingWeeks.every((n: number) =>
          data.teachingWeeks?.some(
            (w) =>
              !w.archived &&
              w.academicYearId === r.academicYearId &&
              w.weekNumber === n &&
              w.isTeachingWeek,
          ),
        ),
      "Choose teaching weeks from the calendar.",
    );
    requireValue(
      r.studentIds?.length &&
        r.studentIds.every(
          (id: string) => ref("students", id)?.campus === r.campus,
        ),
      "Choose individual students on this campus.",
    );
  }
  if (entity === "exceptions" || entity === "availabilityRules") {
    const e =
      r.resourceType === "Lecturer"
        ? "lecturers"
        : r.resourceType === "Room"
          ? "rooms"
          : r.resourceType === "Student"
            ? "students"
            : null;
    requireValue(e && ref(e, r.resourceId), "Choose an individual resource.");
    requireValue(validZone(r.timeZone), "Select the resource time zone.");
    const resource = ref(e!, r.resourceId);
    const owner = campus(resource.primaryCampus || resource.campus);
    const rule = data.availabilityRules?.find(
      (x) =>
        !x.archived &&
        x.resourceId === r.resourceId &&
        x.resourceType === r.resourceType,
    );
    if (entity === "exceptions")
      requireValue(
        r.timeZone === (rule?.timeZone || owner?.timeZone),
        "Use the resource weekly-pattern or primary-campus time zone.",
      );
    if (entity === "exceptions") {
      range();
      times(r.startTime, r.endTime);
      requireValue(
        ["Unavailable", "Available", "Preferred"].includes(
          r.availabilityType,
        ) && r.reason,
        "Choose availability and give a reason.",
      );
    } else {
      requireValue(
        !records(data, entity).some(
          (x) =>
            x.id !== r.id &&
            !x.archived &&
            x.resourceType === r.resourceType &&
            x.resourceId === r.resourceId,
        ),
        "Edit the existing weekly availability for this resource.",
      );
      requireValue(Array.isArray(r.days), "Define availability days.");
      const seen = new Set();
      r.days.forEach((d: any) => {
        requireValue(
          d.dayOfWeek >= 1 && d.dayOfWeek <= 7 && !seen.has(d.dayOfWeek),
          "Duplicate or invalid availability day.",
        );
        seen.add(d.dayOfWeek);
        let end = "";
        [...d.windows]
          .sort((a, b) => a.start.localeCompare(b.start))
          .forEach((w) => {
            times(w.start, w.end);
            requireValue(
              !end || w.start >= end,
              "Availability windows overlap.",
            );
            end = w.end;
          });
      });
    }
  }
  if (entity === "allocations") {
    range();
    const s = ref("students", r.studentId),
      m = ref("modules", r.moduleId);
    requireValue(
      s && m && s.campus === m.campus && s.programmeId === m.programmeId,
      "Student and module must share a programme and campus.",
    );
  }
  if (entity === "travelRules")
    requireValue(
      ref("campuses", r.fromCampusId) &&
        ref("campuses", r.toCampusId) &&
        r.fromCampusId !== r.toCampusId &&
        r.minimumMinutes >= 0,
      "Choose different campuses and travel minutes.",
    );
  if (entity === "conflictReviews")
    requireValue(
      r.fingerprint && String(r.note || "").trim(),
      "A conflict note is required.",
    );
}
export function assertArchive(data: AppData, entity: EntityName, id: string) {
  const active = (e: EntityName) => records(data, e).filter((x) => !x.archived);
  const field: Partial<Record<EntityName, string>> = {
    rooms: "locationId",
    modules: "moduleId",
    programmes: "programmeId",
    campuses: "campusId",
    academicYears: "academicYearId",
    templates: "activityTemplateId",
  };
  const references = (r: any) =>
    entity === "lecturers"
      ? r.staffIds?.includes(id)
      : entity === "students"
        ? r.studentIds?.includes(id)
        : field[entity]
          ? r[field[entity]!] == id
          : false;
  if (
    active("series").some(references) ||
    active("variants").some((v) => references(v.patch))
  )
    throw new Error(
      "This record is used in a timetable. Reassign or archive the related series first.",
    );
  const own = records(data, entity).find((x) => x.id === id);
  const used =
    entity === "programmes"
      ? active("modules").some((m) => m.programmeId === id) ||
        active("students").some((s) => s.programmeId === id)
      : entity === "modules"
        ? active("templates").some((t) => t.moduleId === id) ||
          active("allocations").some((a) => a.moduleId === id)
        : entity === "campuses"
          ? ["rooms", "modules", "programmes", "students", "lecturers"].some(
              (e) =>
                active(e as EntityName).some(
                  (r) =>
                    r.campus === own?.name ||
                    r.primaryCampus === own?.name ||
                    r.additionalCampuses?.includes(own?.name),
                ),
            )
          : entity === "academicYears"
            ? active("terms").some((t) => t.academicYearId === id) ||
              active("teachingWeeks").some((w) => w.academicYearId === id)
            : entity === "terms"
              ? active("teachingWeeks").some((w) => w.termId === id)
              : false;
  if (used)
    throw new Error(
      "Active records depend on this record. Reassign or archive them first.",
    );
}
