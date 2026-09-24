import type {
  AppData,
  Lecturer,
  Module,
  Programme,
  Room,
  Student,
} from "@/types";

const programmeNames: Record<string, string> = {
  BPC: "Bar Practice Course",
  LLB: "Bachelor of Laws",
  LLM: "Master of Laws",
  PGDL: "Postgraduate Diploma in Law",
  SQE1: "Solicitors Qualifying Examination 1",
};

export function normaliseCampusData(input: AppData): AppData {
  const rooms = input.rooms;
  const modules = input.modules.map((module) => ({
    ...module,
    campus: module.campus || campusFromModule(module, input),
    programmeId:
      module.programmeId ||
      programmeId(
        module.campus || campusFromModule(module, input),
        module.course,
      ),
  }));

  const programmes =
    input.programmes !== undefined
      ? input.programmes
      : deriveProgrammes({ ...input, rooms, modules });

  const lecturers = input.lecturers.map((lecturer) =>
    normaliseLecturer(lecturer, modules),
  );
  const students =
    input.students !== undefined
      ? input.students.map((student) => ({
          ...student,
          moduleCodes: student.moduleCodes || [],
        }))
      : deriveLegacyStudents({ ...input, rooms, modules, programmes });

  const sessions = input.sessions.map((session) => ({
    ...session,
    studentIds:
      session.studentIds ??
      students
        .filter(
          (s) =>
            s.campus === session.campus &&
            s.moduleCodes.includes(session.moduleCode),
        )
        .map((s) => s.id),
  }));

  return {
    ...input,
    rooms,
    modules,
    lecturers,
    programmes,
    students,
    sessions,
  };
}

export function campusFromModule(module: Module, data: AppData) {
  if (module.campus) return module.campus;
  if (module.code.toUpperCase().startsWith("BHM-")) return "Birmingham";
  if (module.code.toUpperCase().startsWith("MAN-")) return "Manchester";
  const group = data.studentGroups.find(
    (item) => item.name === module.studentGroup,
  );
  if (group?.campus) return group.campus;
  const lecturer = data.lecturers.find(
    (item) =>
      item.id === module.lecturerId || item.name === module.lecturerName,
  );
  return lecturer?.primaryCampus || lecturer?.preferredCampus || "Birmingham";
}

export function programmeId(campus: string, programme: string) {
  const campusCode = campus.toLowerCase().startsWith("man")
    ? "MAN"
    : campus.toLowerCase().startsWith("bir")
      ? "BHM"
      : slug(campus).slice(0, 3).toUpperCase();
  return `${campusCode}-${slug(programme).toUpperCase()}`;
}

export function staffCanTeachAtCampus(lecturer: Lecturer, campus: string) {
  const primary = lecturer.primaryCampus || lecturer.preferredCampus || "";
  return (
    primary === campus || (lecturer.additionalCampuses || []).includes(campus)
  );
}

export function campusesFromData(data: AppData) {
  return Array.from(
    new Set(
      [
        ...(data.campuses || []).map((c) => c.name),
        ...data.rooms.map((room) => room.campus),
        ...data.studentGroups.map((group) => group.campus),
        ...(data.programmes || []).map((programme) => programme.campus),
        ...data.modules.map(
          (module) => module.campus || campusFromModule(module, data),
        ),
      ].filter(Boolean),
    ),
  ).sort();
}

function normaliseLecturer(lecturer: Lecturer, modules: Module[]): Lecturer {
  const assignedCampuses = Array.from(
    new Set(
      modules
        .filter(
          (module) =>
            module.lecturerId === lecturer.id ||
            module.lecturerName === lecturer.name ||
            lecturer.modules.includes(module.code),
        )
        .map((module) => module.campus)
        .filter(Boolean) as string[],
    ),
  );
  const primaryCampus =
    lecturer.primaryCampus ||
    lecturer.preferredCampus ||
    assignedCampuses[0] ||
    "Birmingham";
  const additionalCampuses =
    lecturer.additionalCampuses !== undefined
      ? Array.from(
          new Set(
            lecturer.additionalCampuses.filter(
              (campus) => campus !== primaryCampus,
            ),
          ),
        )
      : [];
  return {
    ...lecturer,
    primaryCampus,
    preferredCampus: lecturer.preferredCampus || primaryCampus,
    additionalCampuses,
  };
}

function deriveProgrammes(data: AppData): Programme[] {
  const keys = new Map<string, Programme>();
  const add = (campus: string, course: string) => {
    if (!campus || !course) return;
    const id = programmeId(campus, course);
    if (!keys.has(id))
      keys.set(id, {
        id,
        code: course,
        name: programmeNames[course] || course,
        campus,
        academicYear: "2026/27",
        status: "Active",
      });
  };
  data.studentGroups.forEach((group) => add(group.campus, group.course));
  data.modules.forEach((module) =>
    add(module.campus || campusFromModule(module, data), module.course),
  );
  return Array.from(keys.values()).sort((a, b) =>
    `${a.campus}-${a.code}`.localeCompare(`${b.campus}-${b.code}`),
  );
}

function deriveLegacyStudents(data: AppData): Student[] {
  const students: Student[] = [];
  let counter = 1;
  data.studentGroups.forEach((group) => {
    const groupModules = data.modules.filter(
      (module) =>
        module.studentGroup === group.name ||
        (module.course === group.course && module.campus === group.campus),
    );
    const programme = data.programmes?.find(
      (item) => item.campus === group.campus && item.code === group.course,
    );
    const sampleSize = Math.min(5, Math.max(1, group.studentCount));
    for (let index = 0; index < sampleSize; index += 1) {
      const id = `STU-${group.campus === "Manchester" ? "MAN" : "BHM"}-${String(counter).padStart(3, "0")}`;
      students.push({
        id,
        name: `Student ${String(counter).padStart(3, "0")}`,
        email: `student${String(counter).padStart(3, "0")}@example.edu`,
        campus: group.campus,
        programmeId: programme?.id || programmeId(group.campus, group.course),
        programme: group.course,
        cohort: group.name,
        moduleCodes: groupModules.map((module) => module.code),
        status: "Active",
      });
      counter += 1;
    }
  });
  return students;
}

function normaliseRoomType(value?: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/room|classroom|teaching/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function slug(value: string) {
  return String(value || "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
}
