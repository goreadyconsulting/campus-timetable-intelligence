import { DateTime } from "luxon";
import type { AppData, Conflict, Session, Lecturer } from "@/types";
import { staffCanTeachAtCampus } from "./master-data";
import { monday } from "./academic";
import { resolveOccurrences } from "./recurrence";
export function minutes(v: string) {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}
export function roomTypeMatches(actual: string, required = "") {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/^rm-/, "")
      .replace(/classroom|room|teaching|\W/g, "");
  const a = clean(actual),
    b = clean(required);
  return (
    !b ||
    a === b ||
    (Boolean(a) && (a.includes(b) || b.includes(a))) ||
    (b === "largegroup" && /lecture|largegroup/.test(a)) ||
    (b === "advocacy" && /moot|advocacy/.test(a))
  );
}
export function legacyWindows(staff: Lecturer, day: number) {
  const text = (staff.availability || "").toLowerCase(),
    names = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const r = text.match(
    /(mon|tue|wed|thu|fri|sat|sun)\s*[-–]\s*(mon|tue|wed|thu|fri|sat|sun)/,
  );
  const allowed = r
    ? names
        .map((_, i) => i + 1)
        .filter(
          (i) => i >= names.indexOf(r[1]) + 1 && i <= names.indexOf(r[2]) + 1,
        )
    : names.flatMap((n, i) => (text.includes(n) ? [i + 1] : []));
  if (allowed.length && !allowed.includes(day)) return [];
  const t = text.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
  return [{ start: t?.[1] || "08:00", end: t?.[2] || "20:00" }];
}
export function resourceAvailable(
  data: AppData,
  o: Session,
  type: "Lecturer" | "Student" | "Room",
  id: string,
) {
  const rule = data.availabilityRules?.find(
      (r) => !r.archived && r.resourceType === type && r.resourceId === id,
    ),
    staff =
      type === "Lecturer" ? data.lecturers.find((l) => l.id === id) : undefined;
  const campus =
    type === "Room"
      ? data.rooms.find((r) => r.id === id)?.campus
      : type === "Student"
        ? data.students?.find((s) => s.id === id)?.campus
        : staff?.primaryCampus;
  const zone =
    rule?.timeZone ||
    data.campuses?.find((c) => c.name === campus)?.timeZone ||
    o.timeZone!;
  const a = DateTime.fromISO(o.startAtUtc!, { zone }),
    b = DateTime.fromISO(o.endAtUtc!, { zone }),
    date = a.toISODate()!,
    start = a.toFormat("HH:mm"),
    end = b.toFormat("HH:mm");
  const exceptions = (data.exceptions || []).filter(
    (e) =>
      !e.archived &&
      e.resourceType === type &&
      e.resourceId === id &&
      date >= e.startDate &&
      date <= e.endDate,
  );
  if (
    exceptions.some(
      (e) =>
        e.availabilityType === "Unavailable" &&
        start < e.endTime &&
        e.startTime < end,
    )
  )
    return false;
  const available = exceptions.filter(
    (e) => e.availabilityType === "Available",
  );
  const windows = available.length
    ? available.map((e) => ({ start: e.startTime, end: e.endTime }))
    : rule
      ? rule.days.find((d) => d.dayOfWeek === a.weekday)?.windows || []
      : staff
        ? legacyWindows(staff, a.weekday)
        : [{ start: "00:00", end: "23:59" }];
  return (
    a.toISODate() === b.toISODate() &&
    windows.some((w) => start >= w.start && end <= w.end)
  );
}
export function detectOccurrenceConflicts(
  data: AppData,
  occurrences: Session[],
): Conflict[] {
  const active = occurrences
      .filter((o) => o.status !== "Cancelled")
      .sort((a, b) => a.startAtUtc!.localeCompare(b.startAtUtc!)),
    conflicts: Conflict[] = [];
  function add(
    type: string,
    items: Session[],
    description: string,
    severity = "Critical",
    students: string[] = [],
  ) {
    const ids = items.map((o) => o.id).sort(),
      fingerprint = `${type}:${ids.join("|")}`,
      review = data.conflictReviews?.find(
        (r) => r.fingerprint === fingerprint && !r.archived,
      );
    conflicts.push({
      id: fingerprint,
      fingerprint,
      type,
      severity,
      module: [...new Set(items.map((o) => o.moduleCode))].join(" / "),
      lecturer: [...new Set(items.map((o) => o.lecturer))].join(" / "),
      room: [...new Set(items.map((o) => o.room))].join(" / "),
      time: `${items[0].date} ${items[0].start}-${items[0].end} ${items[0].timeZone}`,
      description,
      fix: "Preview a suitable location, time or staff allocation.",
      occurrenceIds: ids,
      seriesIds: [...new Set(items.map((o) => o.seriesId!))],
      campusIds: [...new Set(items.map((o) => o.campusId!))],
      studentIds: students,
      resolved: false,
      resolutionStatus: review ? "Acknowledged" : "Open",
      resolutionNote: review?.note,
    });
  }
  for (const o of active) {
    const room = data.rooms.find((r) => r.id === o.locationId),
      module = data.modules.find((m) => m.id === o.moduleId),
      campus = data.campuses?.find((c) => c.id === o.campusId),
      series = data.series?.find((s) => s.id === o.seriesId),
      template = data.templates?.find(
        (t) => t.id === series?.activityTemplateId,
      );
    if (!room || room.archived || room.status === "Maintenance")
      add(
        "Location unavailable",
        [o],
        "Location is missing, archived or under maintenance.",
      );
    if (room && room.campus !== o.campus)
      add(
        "Location campus mismatch",
        [o],
        "Location belongs to another campus.",
      );
    if (!module || module.archived || module.campus !== o.campus)
      add(
        "Module campus mismatch",
        [o],
        "Module is missing, archived or belongs to another campus.",
      );
    if (o.enrolled > (room?.capacity || 0))
      add(
        "Capacity exceeded",
        [o],
        `${o.enrolled} planned students exceed ${room?.capacity || 0} seats.`,
        "High",
      );
    if (
      room &&
      !roomTypeMatches(
        room.type,
        template?.roomSuitability || module?.roomTypeRequired,
      )
    )
      add(
        "Location type mismatch",
        [o],
        "Location does not meet the required suitability.",
        "High",
      );
    if (
      o.start >= o.end ||
      o.start < (campus?.openingTime || "08:00") ||
      o.end > (campus?.closingTime || "20:00")
    )
      add(
        "Outside teaching hours",
        [o],
        "Session is outside campus teaching hours.",
      );
    if (!o.studentIds?.length)
      add("Students unassigned", [o], "Allocate individual students.", "High");
    if (!o.staffIds?.length)
      add("Staff unassigned", [o], "Assign suitable staff.");
    for (const id of o.staffIds || []) {
      const staff = data.lecturers.find((l) => l.id === id);
      if (!staff || staff.archived || !staffCanTeachAtCampus(staff, o.campus))
        add(
          "Staff campus restriction",
          [o],
          `${staff?.name || id} cannot teach at this campus.`,
        );
      else if (
        template?.lecturerSuitability &&
        !staff.modules.includes(o.moduleCode) &&
        module?.lecturerId !== id
      )
        add(
          "Staff suitability",
          [o],
          `${staff.name} is not allocated to this module.`,
          "High",
        );
      else if (!resourceAvailable(data, o, "Lecturer", id))
        add("Staff unavailable", [o], `${staff.name} is unavailable.`);
    }
    if (room && !resourceAvailable(data, o, "Room", room.id!))
      add(
        "Location unavailable",
        [o],
        "Location has a date or weekly availability restriction.",
      );
    const unavailable = (o.studentIds || []).filter(
      (id) => !resourceAvailable(data, o, "Student", id),
    );
    if (unavailable.length)
      add(
        "Student unavailable",
        [o],
        `${unavailable.length} students are unavailable.`,
        "High",
        unavailable,
      );
    const invalid = (o.studentIds || []).filter(
      (id) =>
        !data.students?.some(
          (s) =>
            s.id === id &&
            !s.archived &&
            s.status === "Active" &&
            s.campus === o.campus &&
            s.programmeId === series?.programmeId &&
            ((data.allocations || []).some(
              (a) =>
                !a.archived && a.studentId === id && a.moduleId === o.moduleId,
            )
              ? (data.allocations || []).some(
                  (a) =>
                    !a.archived &&
                    a.studentId === id &&
                    a.moduleId === o.moduleId &&
                    a.status === "Active" &&
                    a.startDate <= o.date! &&
                    a.endDate >= o.date!,
                )
              : s.moduleCodes.includes(o.moduleCode)),
        ),
    );
    if (invalid.length)
      add(
        "Student allocation invalid",
        [o],
        "Allocated students are inactive or belong to another campus.",
        "High",
        invalid,
      );
  }
  const weekly = new Map<string, Session[]>();
  for (const o of active)
    for (const id of o.staffIds || []) {
      const key = id + "|" + monday(o.date!);
      weekly.set(key, [...(weekly.get(key) || []), o]);
    }
  for (const [key, items] of weekly) {
    const staff = data.lecturers.find((l) => l.id === key.split("|")[0]);
    const hours = items.reduce(
      (n, o) => n + (minutes(o.end) - minutes(o.start)) / 60,
      0,
    );
    if (staff && hours > (staff.maxWeeklyHours || 18))
      add(
        "Staff workload exceeded",
        items,
        `${staff.name} has ${hours} hours against a weekly limit of ${staff.maxWeeklyHours || 18}.`,
        "High",
      );
  }
  const maxTravel = Math.max(
    0,
    ...(data.travelRules || [])
      .filter((r) => !r.archived)
      .map((r) => r.minimumMinutes),
  );
  for (let i = 0; i < active.length; i++) {
    const a = active[i],
      end = Date.parse(a.endAtUtc!);
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j],
        start = Date.parse(b.startAtUtc!);
      if (start >= end + maxTravel * 60000) break;
      const staff = (a.staffIds || []).filter((id) => b.staffIds?.includes(id)),
        students = (a.studentIds || []).filter((id) =>
          b.studentIds?.includes(id),
        );
      if (a.startAtUtc! < b.endAtUtc! && b.startAtUtc! < a.endAtUtc!) {
        if (a.locationId === b.locationId)
          add(
            "Location double booking",
            [a, b],
            "Two sessions overlap in this location.",
          );
        if (staff.length)
          add(
            "Staff double booking",
            [a, b],
            "Staff overlap at the same absolute time.",
          );
        if (students.length)
          add(
            "Individual student clash",
            [a, b],
            `${students.length} students have overlapping classes.`,
            "High",
            students,
          );
      } else if (staff.length && a.campusId !== b.campusId) {
        const rule = data.travelRules?.find(
          (r) =>
            !r.archived &&
            r.fromCampusId === a.campusId &&
            r.toCampusId === b.campusId,
        );
        if (rule && (start - end) / 60000 < rule.minimumMinutes)
          add(
            "Campus travel time",
            [a, b],
            `Allow ${rule.minimumMinutes} minutes between campuses.`,
            "Medium",
          );
      }
    }
  }
  return [...new Map(conflicts.map((c) => [c.fingerprint, c])).values()];
}
export function validateRange(data: AppData, start: string, end: string) {
  return detectOccurrenceConflicts(data, resolveOccurrences(data, start, end));
}
