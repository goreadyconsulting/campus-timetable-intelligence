import type { AppData, Module } from "@/types";
import type {
  ActivityTemplate,
  TemplateValidationItem,
} from "@/types/workflow";

export function createTemplatesFromData(data: AppData): ActivityTemplate[] {
  return data.modules.map((module, index) =>
    createTemplate(module, data, index),
  );
}

export function validateTemplate(
  template: ActivityTemplate,
): TemplateValidationItem[] {
  const durationInQuarterHours = template.durationHours * 4;
  return [
    {
      label: "Campus and programme linked",
      passed: Boolean(template.campus && template.programme),
      message:
        "A campus and campus-specific Programme of Study must be linked to the activity template.",
    },
    {
      label: "Module linked",
      passed: Boolean(template.moduleCode && template.moduleName),
      message:
        "A campus-specific module must be linked to the activity template.",
    },
    {
      label: "Students allocated",
      passed: Boolean((template.studentIds || []).length),
      message:
        "Allocate individual students to the activity before scheduling.",
    },
    {
      label: "Activity description",
      passed: Boolean(template.name && template.activityType),
      message:
        "A clear description and activity type are required for timetable display.",
    },
    {
      label: "Planned size",
      passed: template.plannedSize > 0,
      message:
        "Enter the expected number of students for room-capacity checks.",
    },
    {
      label: "Duration",
      passed:
        template.durationHours > 0 && Number.isInteger(durationInQuarterHours),
      message: "Duration must be entered in 15-minute increments.",
    },
    {
      label: "Teaching pattern",
      passed: template.weeklySessions > 0 && template.teachingWeeks.length > 0,
      message: "Select the number of weekly sessions and the teaching weeks.",
    },
    {
      label: "Tutor suitability",
      passed: Boolean(template.lecturerSuitability),
      message:
        "Choose the staff member or tutor suitability required to deliver this activity.",
    },
    {
      label: "Room suitability",
      passed: Boolean(template.roomSuitability),
      message: "Choose the type of location suitable for this activity.",
    },
  ];
}

export function templateStatus(
  template: ActivityTemplate,
): ActivityTemplate["status"] {
  return validateTemplate(template).every((item) => item.passed)
    ? "Ready"
    : "Blocked";
}

export function readinessSummary(data: AppData, templates: ActivityTemplate[]) {
  const blockedTemplates = templates.filter(
    (template) => templateStatus(template) === "Blocked",
  ).length;
  const openConflicts = data.conflicts.filter(
    (conflict) => !conflict.resolved,
  ).length;
  const students = data.students || [];
  const checks = [
    {
      label: "Activity templates validated",
      passed: blockedTemplates === 0,
      detail: blockedTemplates
        ? `${blockedTemplates} template${blockedTemplates === 1 ? "" : "s"} require attention`
        : `${templates.length} templates ready`,
    },
    {
      label: "Scheduled activities available",
      passed: data.sessions.length > 0,
      detail: `${data.sessions.length} scheduled sessions`,
    },
    {
      label: "No unresolved timetable conflicts",
      passed: openConflicts === 0,
      detail: openConflicts
        ? `${openConflicts} conflict${openConflicts === 1 ? "" : "s"} require review`
        : "No open conflicts",
    },
    {
      label: "Locations and staff loaded",
      passed: data.rooms.length > 0 && data.lecturers.length > 0,
      detail: `${data.rooms.length} locations and ${data.lecturers.length} staff records`,
    },
    {
      label: "Individual students loaded",
      passed:
        students.length > 0 &&
        templates.every((template) =>
          Boolean((template.studentIds || []).length),
        ),
      detail: `${students.length} individual student records`,
    },
  ];
  return {
    checks,
    ready: checks.every((check) => check.passed),
    blockedTemplates,
    openConflicts,
  };
}

export function parseWeekPattern(value: string): number[] {
  const result = new Set<number>();
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const range = item.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
      if (range) {
        const start = Math.max(1, Number(range[1]));
        const end = Math.min(52, Number(range[2]));
        for (
          let week = Math.min(start, end);
          week <= Math.max(start, end);
          week += 1
        )
          result.add(week);
        return;
      }
      const week = Number(item);
      if (week >= 1 && week <= 52) result.add(week);
    });
  return Array.from(result).sort((a, b) => a - b);
}

export function formatWeekPattern(weeks: number[]) {
  if (!weeks.length) return "None selected";
  const sorted = Array.from(new Set(weeks)).sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    parts.push(start === previous ? String(start) : `${start}-${previous}`);
    start = current;
    previous = current;
  }
  return parts.join(", ");
}

function createTemplate(
  module: Module,
  data: AppData,
  index: number,
): ActivityTemplate {
  const requirement = data.requirements.find(
    (item) => item.moduleCode === module.code,
  );
  const group =
    data.studentGroups.find(
      (item) =>
        item.name === (module.studentGroup || requirement?.studentGroup),
    ) ||
    data.studentGroups.find(
      (item) =>
        item.course === module.course &&
        (!module.campus || item.campus === module.campus),
    );
  const lecturer = data.lecturers.find(
    (item) =>
      item.id === module.lecturerId ||
      item.name === module.lecturerName ||
      item.modules.includes(module.code),
  );
  const activityType = activityTypeFromRoom(
    module.roomTypeRequired || requirement?.requiredRoomType || "Teaching room",
  );
  const campus =
    module.campus ||
    group?.campus ||
    lecturer?.primaryCampus ||
    lecturer?.preferredCampus ||
    "Birmingham";
  const students = (data.students || []).filter(
    (student) =>
      student.campus === campus && student.moduleCodes.includes(module.code),
  );
  const programme =
    data.programmes?.find((item) => item.id === module.programmeId) ||
    data.programmes?.find(
      (item) => item.campus === campus && item.code === module.course,
    );
  const template: ActivityTemplate = {
    id: `AT-${module.id || String(index + 1).padStart(3, "0")}`,
    name: `${campus} – ${programme?.code || module.course} – ${module.name} ${activityType}`,
    campus,
    programme: programme?.code || module.course,
    moduleCode: module.code,
    moduleName: module.name,
    activityType,
    plannedSize: group?.studentCount || students.length || 0,
    durationHours: module.hoursPerSession || 2,
    weeklySessions: module.weeklySessions || 1,
    academicYearId: data.academicYears?.[0]?.id,
    moduleId: module.id,
    teachingWeeks: (data.teachingWeeks || [])
      .filter(
        (w) =>
          w.isTeachingWeek && w.academicYearId === data.academicYears?.[0]?.id,
      )
      .map((w) => w.weekNumber),
    studentIds: students.map((student) => student.id),
    studentGroup:
      group?.name || module.studentGroup || requirement?.studentGroup || "",
    lecturerSuitability: lecturer ? lecturer.name : "",
    roomSuitability:
      module.roomTypeRequired ||
      requirement?.requiredRoomType ||
      "Workshop room",
    preferredDays: requirement?.preferredDays || "",
    preferredTime: requirement?.preferredTime || "",
    publicationRule: "Standard",
    status: "Draft",
    updatedAt: new Date().toISOString(),
  };
  return { ...template, status: templateStatus(template) };
}

function activityTypeFromRoom(value: string) {
  const text = value.toLowerCase();
  if (text.includes("moot") || text.includes("advoc")) return "Advocacy";
  if (text.includes("large") || text.includes("lecture")) return "Large Group";
  if (text.includes("oral")) return "Oral Skills";
  if (text.includes("meeting")) return "Meeting";
  return "Workshop";
}
