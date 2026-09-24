import type { AppData } from "@/types";
import type { EntityName } from "@/types/scheduling";
import { assertRecord, records } from "./validation";
import { parseWeeks } from "./academic";
export const importFields: Partial<Record<EntityName, string[]>> = {
  rooms: ["room", "campus", "building", "type", "capacity", "status"],
  lecturers: [
    "name",
    "department",
    "primaryCampus",
    "additionalCampuses",
    "maxWeeklyHours",
    "availability",
    "modules",
  ],
  programmes: ["name", "code", "campus", "academicYear", "status"],
  modules: [
    "name",
    "code",
    "campus",
    "programmeId",
    "lecturerId",
    "weeklySessions",
    "hoursPerSession",
    "roomTypeRequired",
  ],
  students: ["name", "email", "campus", "programmeId", "moduleCodes", "status"],
  templates: [
    "name",
    "campus",
    "academicYearId",
    "moduleId",
    "activityType",
    "plannedSize",
    "durationHours",
    "weeklySessions",
    "teachingWeeks",
    "studentIds",
    "roomSuitability",
    "lecturerSuitability",
    "preferredDays",
    "preferredTime",
    "avoidedDays",
  ],
  exceptions: [
    "resourceType",
    "resourceId",
    "startDate",
    "endDate",
    "startTime",
    "endTime",
    "availabilityType",
    "timeZone",
    "reason",
    "notes",
  ],
};
export function previewImport(
  data: AppData,
  entity: EntityName,
  rows: Record<string, string>[],
  mapping: Record<string, string>,
) {
  const copy = structuredClone(data);
  return rows.map((row, i) => {
    const value: any = {
      id: `IMPORT-${i}`,
      status:
        entity === "rooms"
          ? "Available"
          : entity === "templates"
            ? "Draft"
            : "Active",
      weeklyHours: 0,
      workload: "Normal",
      additionalCampuses: [],
      modules: [],
      moduleCodes: [],
      studentIds: [],
      studentGroup: "",
      publicationRule: "Standard",
      updatedAt: new Date().toISOString(),
    };
    for (const field of importFields[entity] || []) {
      const raw = row[mapping[field]];
      if (raw === undefined || raw === "") continue;
      value[field] = [
        "capacity",
        "maxWeeklyHours",
        "weeklySessions",
        "hoursPerSession",
        "plannedSize",
        "durationHours",
      ].includes(field)
        ? Number(raw)
        : [
              "additionalCampuses",
              "modules",
              "moduleCodes",
              "studentIds",
            ].includes(field)
          ? raw
              .split("|")
              .map((s) => s.trim())
              .filter(Boolean)
          : raw;
    }
    try {
      if (entity === "templates") {
        value.teachingWeeks = parseWeeks(value.teachingWeeks || "");
        const m = data.modules.find((m) => m.id === value.moduleId);
        value.moduleCode = m?.code;
        value.moduleName = m?.name;
        value.programme = m?.course;
      }
      if (entity === "modules")
        value.course =
          data.programmes?.find((p) => p.id === value.programmeId)?.name || "";
      if (entity === "students")
        value.programme =
          data.programmes?.find((p) => p.id === value.programmeId)?.name || "";
      if (
        ["students", "lecturers"].includes(entity) &&
        records(copy, entity).some(
          (r) =>
            !r.archived &&
            r.name === value.name &&
            (r.campus === value.campus ||
              r.primaryCampus === value.primaryCampus),
        )
      )
        throw new Error(
          "A matching record already exists. Edit it in master data.",
        );
      assertRecord(copy, entity, value);
      (copy as any)[entity] = [...records(copy, entity), value];
      return { row: i + 2, record: value, error: "" };
    } catch (e) {
      return { row: i + 2, record: value, error: (e as Error).message };
    }
  });
}
