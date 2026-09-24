"use client";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useCampusData } from "@/components/data-context";
import { Field, FormError } from "@/components/modal";
import { resolveOccurrences } from "@/lib/recurrence";
import { detectOccurrenceConflicts, minutes } from "@/lib/constraints";
import { datePlus } from "@/lib/academic";
import { downloadCsv, downloadIcs, timetableRows } from "@/lib/export";
export default function Reports() {
  const c = useCampusData();
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [kind, setKind] = useState("Timetable"),
    [staff, setStaff] = useState(""),
    [student, setStudent] = useState(""),
    [module, setModule] = useState(""),
    [room, setRoom] = useState(""),
    [programme, setProgramme] = useState("");
  const from = start || c.weekStart,
    until = end || datePlus(c.weekStart, 6);
  const result = useMemo(() => {
    try {
      if (from > until || until > datePlus(from, 370))
        throw new Error("Select a range of up to 370 days.");
      const all = resolveOccurrences(c.rawData, from, until, true),
        sessions = all.filter(
          (s) =>
            s.academicYearId === c.academicYearId &&
            (c.campus === "All campuses" || s.campus === c.campus) &&
            (!staff || s.staffIds?.includes(staff)) &&
            (!student || s.studentIds?.includes(student)) &&
            (!module || s.moduleId === module) &&
            (!room || s.locationId === room) &&
            (!programme ||
              c.rawData.series?.find((x) => x.id === s.seriesId)
                ?.programmeId === programme),
        );
      let rows: Record<string, unknown>[] = timetableRows(sessions);
      if (kind === "Conflicts") {
        const ids = new Set(sessions.map((s) => s.id));
        rows = detectOccurrenceConflicts(c.rawData, all).filter((x) =>
          x.occurrenceIds?.some((id) => ids.has(id)),
        );
      }
      if (kind === "Changes")
        rows = (c.rawData.variants || []).filter(
          (v) => !v.archived && sessions.some((s) => s.seriesId === v.seriesId),
        );
      if (kind === "Capacity")
        rows = sessions.map((s) => ({
          Date: s.date,
          Module: s.moduleName,
          Campus: s.campus,
          Location: s.room,
          Planned: s.enrolled,
          Seats: s.capacity,
          Spare: s.capacity - s.enrolled,
          OccupancyPercent: Math.round(
            (s.enrolled / Math.max(1, s.capacity)) * 100,
          ),
        }));
      if (kind === "Staff workload")
        rows = c.rawData.lecturers
          .filter((l) => !l.archived && (!staff || staff === l.id))
          .map((l) => ({
            Staff: l.name,
            Campus: l.primaryCampus,
            Hours: sessions
              .filter(
                (s) => s.status !== "Cancelled" && s.staffIds?.includes(l.id!),
              )
              .reduce(
                (n, s) => n + (minutes(s.end) - minutes(s.start)) / 60,
                0,
              ),
            WeeklyLimit: l.maxWeeklyHours,
            Range: `${from} to ${until}`,
          }));
      if (kind === "Activities")
        rows = (c.rawData.templates || []).filter(
          (t) =>
            !t.archived &&
            t.academicYearId === c.academicYearId &&
            (c.campus === "All campuses" || t.campus === c.campus),
        );
      if (kind === "Publications") rows = c.rawData.publications || [];
      return { sessions, rows, error: "" };
    } catch (e) {
      return { sessions: [], rows: [], error: (e as Error).message };
    }
  }, [
    c.rawData,
    c.academicYearId,
    c.campus,
    from,
    until,
    kind,
    staff,
    student,
    module,
    room,
    programme,
  ]);
  const select = (
    label: string,
    value: string,
    set: (v: string) => void,
    options: { id: string; name: string }[],
  ) => (
    <Field label={label}>
      <select
        className="input"
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <AppShell
      title="Reports"
      subtitle="Export dated teaching, capacity, changes and workload"
    >
      <div className="enterprise-card p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Report">
            <select
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {[
                "Timetable",
                "Conflicts",
                "Changes",
                "Capacity",
                "Staff workload",
                "Activities",
                "Publications",
              ].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input
              type="date"
              className="input"
              value={from}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Until">
            <input
              type="date"
              className="input"
              value={until}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          {select(
            "Programme",
            programme,
            setProgramme,
            c.rawData.programmes || [],
          )}
          {select(
            "Module",
            module,
            setModule,
            c.rawData.modules.map((m) => ({ id: m.id!, name: m.name })),
          )}
          {select(
            "Staff",
            staff,
            setStaff,
            c.rawData.lecturers.map((l) => ({ id: l.id!, name: l.name })),
          )}
          {select("Student", student, setStudent, c.rawData.students || [])}
          {select(
            "Location",
            room,
            setRoom,
            c.rawData.rooms.map((r) => ({ id: r.id!, name: r.room })),
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => {
              const y = c.rawData.academicYears?.find(
                (y) => y.id === c.academicYearId,
              );
              if (y) {
                setStart(y.startDate);
                setEnd(y.endDate);
              }
            }}
          >
            Full academic year
          </button>
          <button
            className="btn-primary"
            disabled={!!result.error}
            onClick={() =>
              downloadCsv(
                `${kind.toLowerCase().replaceAll(" ", "-")}.csv`,
                result.rows,
              )
            }
          >
            Export CSV
          </button>
          {kind === "Timetable" && (
            <button
              className="btn-secondary"
              disabled={!!result.error}
              onClick={() => downloadIcs("timetable.ics", result.sessions)}
            >
              Export calendar
            </button>
          )}
          <button className="btn-secondary" onClick={() => window.print()}>
            Print
          </button>
        </div>
        <FormError message={result.error} />
      </div>
      <div className="enterprise-card mt-5 overflow-hidden">
        <p className="p-4 text-sm text-slate-500">
          {result.rows.length} rows · Preview shows the first 100
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {Object.keys(result.rows[0] || {})
                  .slice(0, 12)
                  .map((k) => (
                    <th key={k}>{k}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 100).map((r, i) => (
                <tr key={i}>
                  {Object.values(r)
                    .slice(0, 12)
                    .map((v, j) => (
                      <td key={j}>
                        {Array.isArray(v)
                          ? v.join(", ")
                          : typeof v === "object"
                            ? JSON.stringify(v)
                            : String(v ?? "")}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
