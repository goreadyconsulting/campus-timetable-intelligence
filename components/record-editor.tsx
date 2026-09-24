"use client";
import { useState } from "react";
import { useCampusData } from "./data-context";
import { Field, FormError, Modal } from "./modal";
import type { EntityName } from "@/types/scheduling";
import { days, parseWeeks, campusToday } from "@/lib/academic";
import { assertRecord } from "@/lib/validation";
export const entityLabels: Record<EntityName, string> = {
  rooms: "Location",
  lecturers: "Staff member",
  students: "Student",
  programmes: "Programme",
  modules: "Module",
  templates: "Activity",
  exceptions: "Availability exception",
  campuses: "Campus",
  academicYears: "Academic year",
  terms: "Term",
  teachingWeeks: "Teaching week",
  series: "Series",
  variants: "Change",
  availabilityRules: "Weekly availability",
  travelRules: "Campus travel",
  allocations: "Student module allocation",
  conflictReviews: "Conflict acknowledgement",
};
export function RecordEditor({
  entity,
  record,
  onClose,
}: {
  entity: EntityName;
  record?: any;
  onClose: () => void;
}) {
  const c = useCampusData(),
    d = c.rawData,
    year =
      d.academicYears?.find((y) => y.id === c.academicYearId) ||
      d.academicYears?.[0];
  const [value, setValue] = useState<any>(() => ({
    campus: c.campus === "All campuses" ? d.campuses?.[0]?.name : c.campus,
    academicYearId: year?.id,
    academicYear: year?.name,
    startDate: year?.startDate || campusToday(),
    endDate: year?.endDate || campusToday(),
    status:
      entity === "rooms"
        ? "Available"
        : entity === "templates"
          ? "Draft"
          : entity === "series"
            ? "Scheduled"
            : "Active",
    primaryCampus: d.campuses?.[0]?.name,
    additionalCampuses: [],
    moduleCodes: [],
    modules: [],
    studentIds: [],
    staffIds: [],
    teachingWeeks: [],
    weeklyHours: 0,
    workload: "Normal",
    maxWeeklyHours: 18,
    availability: "Mon-Fri 09:00-17:00",
    type: "Workshop",
    capacity: 30,
    plannedSize: 30,
    durationHours: 2,
    weeklySessions: 1,
    hoursPerSession: 2,
    roomTypeRequired: "Workshop",
    roomSuitability: "Workshop",
    activityType: "Workshop",
    publicationRule: "Standard",
    preferredDays: "",
    preferredTime: "",
    avoidedDays: "",
    lecturerSuitability: "",
    studentGroup: "",
    dayOfWeek: 1,
    startLocalTime: "09:00",
    endLocalTime: "11:00",
    locationId: "",
    timeZone: "Europe/London",
    openingTime: "08:00",
    closingTime: "20:00",
    active: true,
    isTeachingWeek: true,
    resourceType: "Lecturer",
    availabilityType: "Unavailable",
    startTime: "09:00",
    endTime: "17:00",
    days: days.map((_, i) => ({
      dayOfWeek: i + 1,
      windows: i < 5 ? [{ start: "09:00", end: "17:00" }] : [],
    })),
    ...record,
  }));
  const [weeks, setWeeks] = useState((record?.teachingWeeks || []).join(", ")),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const set = (key: string, x: any) =>
    setValue((v: any) => ({ ...v, [key]: x }));
  const input = (
    key: string,
    label: string,
    type = "text",
    required = true,
  ) => (
    <Field label={label}>
      <input
        className="input w-full"
        required={required}
        type={type}
        value={value[key] ?? ""}
        step={type === "number" ? "0.25" : undefined}
        onChange={(e) =>
          set(key, type === "number" ? Number(e.target.value) : e.target.value)
        }
      />
    </Field>
  );
  const select = (
    key: string,
    label: string,
    options: { id: string; name: string }[],
    multi = false,
  ) => (
    <Field label={label}>
      <select
        className="input w-full"
        required={
          !multi &&
          key !== "activityTemplateId" &&
          key !== "termId" &&
          key !== "lecturerId"
        }
        multiple={multi}
        value={value[key] ?? (multi ? [] : "")}
        onChange={(e) => {
          const next = multi
            ? Array.from(e.target.selectedOptions).map((o) => o.value)
            : e.target.value;
          set(key, next);
          if (key === "campus")
            setValue((v: any) => ({
              ...v,
              campus: next,
              programmeId: "",
              moduleId: "",
              studentIds: [],
            }));
          if (key === "moduleId") {
            const m = d.modules.find((m) => m.id === next);
            if (m)
              setValue((v: any) => ({
                ...v,
                moduleId: m.id,
                moduleCode: m.code,
                moduleName: m.name,
                campus: m.campus,
                programme: m.course,
                programmeId: m.programmeId,
                roomSuitability: m.roomTypeRequired || "Workshop",
                studentIds: [],
              }));
          }
          if (key === "programmeId")
            setValue((v: any) => ({
              ...v,
              programmeId: next,
              programme: d.programmes?.find((p) => p.id === next)?.name || "",
              moduleCodes: [],
            }));
        }}
      >
        {!multi && <option value="">Choose</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {multi && (
        <span className="text-xs font-normal text-slate-500">
          Select one or more. Use Ctrl or ⌘ to select multiple entries.
        </span>
      )}
    </Field>
  );
  const campuses = (d.campuses || [])
    .filter((r) => !r.archived)
    .map((r) => ({ id: r.name, name: r.name }));
  const campus = () => select("campus", "Campus", campuses);
  const programmes = () =>
    select(
      "programmeId",
      "Programme",
      (d.programmes || [])
        .filter((p) => !p.archived && p.campus === value.campus)
        .map((p) => ({ id: p.id, name: p.name })),
    );
  const yearField = () =>
    select(
      "academicYearId",
      "Academic year",
      (d.academicYears || []).filter((y) => !y.archived),
    );
  const dateFields = () => (
    <>
      {input("startDate", "Start date", "date")}
      {input("endDate", "End date", "date")}
    </>
  );
  const studentField = () =>
    select(
      "studentIds",
      "Individual students",
      (d.students || [])
        .filter(
          (s) =>
            !s.archived &&
            s.campus === value.campus &&
            (!value.moduleCode || s.moduleCodes.includes(value.moduleCode)),
        )
        .map((s) => ({ id: s.id, name: `${s.name} · ${s.id}` })),
      true,
    );
  const resource = () => (
    <>
      {select(
        "resourceType",
        "Resource type",
        ["Lecturer", "Student", "Room"].map((id) => ({
          id,
          name: id === "Lecturer" ? "Staff" : id === "Room" ? "Location" : id,
        })),
      )}
      {select(
        "resourceId",
        "Resource",
        (value.resourceType === "Lecturer"
          ? d.lecturers
          : value.resourceType === "Room"
            ? d.rooms
            : d.students || []
        )
          .filter((r: any) => !r.archived)
          .map((r: any) => ({ id: r.id, name: r.name || r.room })),
      )}
      {input("timeZone", "Resource time zone")}
    </>
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = { ...value };
      if (entity === "templates" || entity === "series")
        next.teachingWeeks = parseWeeks(
          weeks,
          (d.teachingWeeks || [])
            .filter(
              (w) =>
                w.academicYearId === value.academicYearId &&
                w.isTeachingWeek &&
                !w.archived,
            )
            .map((w) => w.weekNumber),
        );
      if (entity === "series") {
        const campus = d.campuses?.find((c) => c.name === next.campus);
        next.dayOfWeek = Number(next.dayOfWeek);
        next.campusId = campus?.id;
        next.timeZone = campus?.timeZone;
        next.programmeId = d.modules.find(
          (m) => m.id === next.moduleId,
        )?.programmeId;
        next.createdAt = record?.createdAt || new Date().toISOString();
      }
      if (entity === "modules")
        next.course =
          d.programmes?.find((p) => p.id === next.programmeId)?.name || "";
      if (entity === "students")
        next.programme =
          d.programmes?.find((p) => p.id === next.programmeId)?.name || "";
      if (entity === "exceptions")
        next.resourceName = (
          next.resourceType === "Lecturer"
            ? d.lecturers
            : next.resourceType === "Room"
              ? d.rooms
              : d.students || []
        )
          .map((r: any) => ({ id: r.id, name: r.name || r.room }))
          .find((r) => r.id === next.resourceId)?.name;
      assertRecord(d, entity, { ...next, id: next.id || "PREVIEW" });
      await c.save(entity, next);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${record?.id ? "Edit" : "Add"} ${entityLabels[entity].toLowerCase()}`}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          {entity === "rooms" && (
            <>
              {input("room", "Location name")}
              {campus()}
              {input("building", "Building")}
              {input("type", "Location type")}
              {input("capacity", "Capacity", "number")}
              {select(
                "status",
                "Status",
                ["Available", "Maintenance"].map((id) => ({ id, name: id })),
              )}
            </>
          )}
          {entity === "lecturers" && (
            <>
              {input("name", "Name")}
              {input("department", "Department")}
              {select("primaryCampus", "Primary campus", campuses)}
              {select(
                "additionalCampuses",
                "Additional authorised campuses",
                campuses.filter((c) => c.id !== value.primaryCampus),
                true,
              )}
              {input("maxWeeklyHours", "Maximum weekly hours", "number")}
              {input("availability", "Weekly availability")}
              {select(
                "modules",
                "Suitable modules",
                d.modules
                  .filter((m) => !m.archived)
                  .map((m) => ({
                    id: m.code,
                    name: `${m.code} · ${m.campus}`,
                  })),
                true,
              )}
            </>
          )}
          {entity === "programmes" && (
            <>
              {input("name", "Programme name")}
              {input("code", "Code")}
              {campus()}
              {input("academicYear", "Academic year")}
              {select(
                "status",
                "Status",
                ["Active", "Inactive"].map((id) => ({ id, name: id })),
              )}
            </>
          )}
          {entity === "modules" && (
            <>
              {input("name", "Module name")}
              {input("code", "Code")}
              {campus()}
              {programmes()}
              {input("roomTypeRequired", "Required location type")}
              {input("weeklySessions", "Weekly sessions", "number")}
              {input("hoursPerSession", "Session duration (hours)", "number")}
              {select(
                "lecturerId",
                "Preferred staff",
                d.lecturers
                  .filter((l) => !l.archived)
                  .map((l) => ({ id: l.id!, name: l.name })),
              )}
            </>
          )}
          {entity === "students" && (
            <>
              {input("name", "Name")}
              {input("email", "Email", "email", false)}
              {campus()}
              {programmes()}
              {input("cohort", "Cohort", "text", false)}
              {select(
                "moduleCodes",
                "Module allocations",
                d.modules
                  .filter(
                    (m) =>
                      !m.archived &&
                      m.campus === value.campus &&
                      m.programmeId === value.programmeId,
                  )
                  .map((m) => ({ id: m.code, name: `${m.code} · ${m.name}` })),
                true,
              )}
              {select(
                "status",
                "Status",
                ["Active", "Inactive"].map((id) => ({ id, name: id })),
              )}
            </>
          )}
          {entity === "templates" && (
            <>
              {input("name", "Activity name")}
              {campus()}
              {select(
                "moduleId",
                "Module",
                d.modules
                  .filter((m) => !m.archived && m.campus === value.campus)
                  .map((m) => ({ id: m.id!, name: `${m.code} · ${m.name}` })),
              )}
              {yearField()}
              {input("activityType", "Activity type")}
              {input("plannedSize", "Planned size", "number")}
              {input("durationHours", "Duration in hours", "number")}
              {input("weeklySessions", "Sessions per week", "number")}
              <Field label="Teaching weeks">
                <input
                  required
                  className="input"
                  placeholder="1-6, 8-12"
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value)}
                />
                <span className="text-xs">
                  Available:{" "}
                  {d.teachingWeeks
                    ?.filter(
                      (w) =>
                        w.academicYearId === value.academicYearId &&
                        w.isTeachingWeek &&
                        !w.archived,
                    )
                    .map((w) => w.weekNumber)
                    .join(", ")}
                </span>
              </Field>
              {studentField()}
              {input("roomSuitability", "Location suitability")}
              {input("lecturerSuitability", "Staff suitability", "text", false)}
              {input("preferredDays", "Preferred days", "text", false)}
              {input("avoidedDays", "Avoid days", "text", false)}
              {input("preferredTime", "Preferred time", "text", false)}
              {select(
                "publicationRule",
                "Publication rule",
                ["Standard", "Hold until approved"].map((id) => ({
                  id,
                  name: id,
                })),
              )}
            </>
          )}
          {entity === "series" && (
            <>
              {campus()}
              {select(
                "moduleId",
                "Module",
                d.modules
                  .filter((m) => !m.archived && m.campus === value.campus)
                  .map((m) => ({ id: m.id!, name: `${m.code} · ${m.name}` })),
              )}
              {select(
                "status",
                "Status",
                ["Scheduled", "Draft", "Cancelled"].map((id) => ({
                  id,
                  name: id,
                })),
              )}
              {select(
                "activityTemplateId",
                "Planned activity",
                (d.templates || [])
                  .filter((t) => !t.archived && t.moduleId === value.moduleId)
                  .map((t) => ({ id: t.id, name: t.name })),
              )}
              {yearField()}
              {dateFields()}
              {select(
                "dayOfWeek",
                "Day",
                days.map((name, i) => ({ id: String(i + 1), name })),
              )}
              {input("startLocalTime", "Start time", "time")}
              {input("endLocalTime", "End time", "time")}
              {select(
                "locationId",
                "Location",
                d.rooms
                  .filter((r) => !r.archived && r.campus === value.campus)
                  .map((r) => ({
                    id: r.id!,
                    name: `${r.room} · ${r.capacity} seats`,
                  })),
              )}
              {select(
                "staffIds",
                "Staff",
                d.lecturers
                  .filter((l) => !l.archived)
                  .map((l) => ({ id: l.id!, name: l.name })),
                true,
              )}
              {studentField()}
              {input("plannedSize", "Planned size", "number")}
              <Field label="Teaching weeks">
                <input
                  className="input"
                  required
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value)}
                  placeholder="1-6, 8-12"
                />
              </Field>
            </>
          )}
          {entity === "campuses" && (
            <>
              {input("name", "Campus name")}
              {input("code", "Campus code")}
              {input("timeZone", "IANA time zone")}
              {input("openingTime", "Teaching opens", "time")}
              {input("closingTime", "Teaching closes", "time")}
              <label>
                <input
                  type="checkbox"
                  checked={value.active}
                  onChange={(e) => set("active", e.target.checked)}
                />{" "}
                Active campus
              </label>
            </>
          )}
          {(entity === "academicYears" || entity === "terms") && (
            <>
              {input("name", "Name")}
              {entity === "terms" && yearField()}
              {dateFields()}
            </>
          )}
          {entity === "teachingWeeks" && (
            <>
              {yearField()}
              {select(
                "termId",
                "Term",
                (d.terms || []).filter(
                  (t) =>
                    !t.archived && t.academicYearId === value.academicYearId,
                ),
              )}
              {input("weekNumber", "Week number", "number")}
              {dateFields()}
              {input("label", "Week label")}
              <label>
                <input
                  type="checkbox"
                  checked={value.isTeachingWeek}
                  onChange={(e) => set("isTeachingWeek", e.target.checked)}
                />{" "}
                Teaching takes place this week
              </label>
            </>
          )}
          {entity === "exceptions" && (
            <>
              {resource()}
              {dateFields()}
              {input("startTime", "From", "time")}
              {input("endTime", "Until", "time")}
              {select(
                "availabilityType",
                "Availability",
                ["Unavailable", "Available", "Preferred"].map((id) => ({
                  id,
                  name: id,
                })),
              )}
              {input("reason", "Reason")}
              {input("notes", "Notes", "text", false)}
            </>
          )}
          {entity === "availabilityRules" && (
            <>
              {resource()}
              <div className="col-span-full space-y-3">
                {days.map((day, index) => {
                  const entry = value.days.find(
                    (d: any) => d.dayOfWeek === index + 1,
                  ) || { dayOfWeek: index + 1, windows: [] };
                  const change = (windows: any[]) =>
                    set("days", [
                      ...value.days.filter(
                        (d: any) => d.dayOfWeek !== index + 1,
                      ),
                      { ...entry, windows },
                    ]);
                  return (
                    <div className="rounded-xl border p-3" key={day}>
                      <p className="mb-2 font-semibold">{day}</p>
                      {entry.windows.map((w: any, i: number) => (
                        <div
                          key={i}
                          className="mb-2 flex flex-wrap items-end gap-2"
                        >
                          <Field label="From">
                            <input
                              className="input"
                              type="time"
                              value={w.start}
                              onChange={(e) =>
                                change(
                                  entry.windows.map((x: any, j: number) =>
                                    j === i
                                      ? { ...x, start: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <Field label="Until">
                            <input
                              className="input"
                              type="time"
                              value={w.end}
                              onChange={(e) =>
                                change(
                                  entry.windows.map((x: any, j: number) =>
                                    j === i ? { ...x, end: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() =>
                              change(
                                entry.windows.filter(
                                  (_: any, j: number) => i !== j,
                                ),
                              )
                            }
                          >
                            Remove window
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          change([
                            ...entry.windows,
                            { start: "09:00", end: "17:00" },
                          ])
                        }
                      >
                        Add window
                      </button>
                      {!entry.windows.length && (
                        <span className="ml-3 text-sm text-slate-500">
                          Unavailable
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {entity === "travelRules" && (
            <>
              {select("fromCampusId", "From campus", d.campuses || [])}
              {select("toCampusId", "To campus", d.campuses || [])}
              {input("minimumMinutes", "Minimum travel minutes", "number")}
            </>
          )}
          {entity === "allocations" && (
            <>
              {select("studentId", "Student", d.students || [])}
              {select(
                "moduleId",
                "Module",
                d.modules.map((m) => ({
                  id: m.id!,
                  name: `${m.code} · ${m.campus}`,
                })),
              )}
              {dateFields()}
              {select(
                "status",
                "Status",
                ["Active", "Inactive"].map((id) => ({ id, name: id })),
              )}
            </>
          )}
        </div>
        <FormError message={error} />
        <div className="mt-6 flex justify-end">
          <button
            className="btn-primary"
            disabled={busy || !c.canWrite}
            type="submit"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
