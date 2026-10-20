"use client";
import { useMemo, useState, useEffect, useRef } from "react";
import { DateTime } from "luxon";
import { AppShell } from "@/components/app-shell";
import { useCampusData } from "@/components/data-context";
import { ClassPanel } from "@/components/class-panel";
import { RecordEditor } from "@/components/record-editor";
import { datePlus, days, monday, campusToday } from "@/lib/academic";
import { minutes } from "@/lib/constraints";
import { downloadCsv, timetableRows, downloadIcs } from "@/lib/export";
import type { Session } from "@/types";
import type { SeriesPatch } from "@/types/scheduling";
const PREFERENCES = "cti-timetable-preferences";
export default function Timetable() {
  const c = useCampusData();
  const [clock, setClock] = useState<number | null>(null);
  useEffect(() => {
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const zones = [
    ...new Set(
      (c.rawData.campuses || [])
        .filter(
          (x) =>
            !x.archived && (c.campus === "All campuses" || x.name === c.campus),
        )
        .map((x) => x.timeZone),
    ),
  ];
  const localNow =
    clock && zones.length === 1
      ? DateTime.fromMillis(clock).setZone(zones[0])
      : null;
  const [selected, setSelected] = useState<Session | null>(null),
    [patch, setPatch] = useState<SeriesPatch>({}),
    [q, setQ] = useState(""),
    [agenda, setAgenda] = useState(true),
    [lecturer, setLecturer] = useState(""),
    [course, setCourse] = useState(""),
    [room, setRoom] = useState(""),
    [filtersOpen, setFiltersOpen] = useState(false),
    [create, setCreate] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const previousCampus = useRef(c.campus);
  useEffect(() => {
    if (!c.scopeReady || preferencesReady) return;
    try {
      const saved = JSON.parse(localStorage.getItem(PREFERENCES) || "{}");
      if (saved?.view === "calendar" || saved?.view === "list")
        setAgenda(saved.view === "list");
      if (typeof saved?.search === "string") setQ(saved.search);
      if (typeof saved?.lecturer === "string") setLecturer(saved.lecturer);
      if (saved?.campus === c.campus) {
        if (typeof saved.course === "string") setCourse(saved.course);
        if (typeof saved.room === "string") setRoom(saved.room);
      }
    } catch {}
    previousCampus.current = c.campus;
    setPreferencesReady(true);
  }, [c.scopeReady, c.campus, preferencesReady]);
  useEffect(() => {
    if (!preferencesReady) return;
    try {
      localStorage.setItem(
        PREFERENCES,
        JSON.stringify({
          view: agenda ? "list" : "calendar",
          search: q,
          lecturer,
          course,
          room,
          campus: c.campus,
        }),
      );
    } catch {}
  }, [preferencesReady, agenda, q, lecturer, course, room, c.campus]);
  function courseForSession(session: Session) {
    const programmeId =
      c.rawData.series?.find((item) => item.id === session.seriesId)
        ?.programmeId ||
      c.rawData.modules.find((item) => item.id === session.moduleId)
        ?.programmeId;
    const programme = c.rawData.programmes?.find(
      (item) => item.id === programmeId,
    );
    return {
      id: programme?.id || session.course,
      name: programme?.name || session.course,
    };
  }
  const sessions = c.data.sessions
    .filter((s) => {
      const text = [
        s.moduleCode,
        s.moduleName,
        s.lecturer,
        s.room,
        ...(s.studentIds || []),
        s.course,
        courseForSession(s).name,
      ]
        .join(" ")
        .toLowerCase();
      return (
        q
          .trim()
          .toLowerCase()
          .split(/\s+/)
          .every((part) => text.includes(part)) &&
        (!lecturer || s.staffIds?.includes(lecturer)) &&
        (!course || courseForSession(s).id === course) &&
        (!room || s.locationId === room)
      );
    })
    .sort(
      (a, b) =>
        (a.date || "").localeCompare(b.date || "") ||
        a.start.localeCompare(b.start) ||
        a.moduleName.localeCompare(b.moduleName),
    );
  const staffOptions = c.rawData.lecturers.filter((l) => !l.archived);
  const courseOptions = [
    ...new Map(
      [
        ...(c.rawData.programmes || [])
          .filter((p) => !p.archived)
          .map((p) => ({ id: p.id, name: `${p.name} · ${p.campus}` })),
        ...c.data.sessions
          .filter(
            (s) =>
              !c.rawData.programmes?.some(
                (p) => p.id === courseForSession(s).id,
              ),
          )
          .map(courseForSession),
      ]
        .filter((p) => p.id)
        .map((p) => [p.id, p]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const roomOptions = c.rawData.rooms.filter(
    (r) =>
      !r.archived && (c.campus === "All campuses" || r.campus === c.campus),
  );
  const filtered = Boolean(q || lecturer || course || room);
  function clearFilters() {
    setQ("");
    setLecturer("");
    setCourse("");
    setRoom("");
  }
  useEffect(() => {
    if (preferencesReady && previousCampus.current !== c.campus) {
      setRoom("");
      setCourse("");
    }
    previousCampus.current = c.campus;
  }, [c.campus, preferencesReady]);
  const activeConflicts = c.data.conflicts.filter((x) => !x.resolved);
  const columns = days.map((day, i) => ({
    day,
    date: datePlus(monday(c.weekStart), i),
  }));
  function edit(s: Session, p: SeriesPatch = {}) {
    setSelected(s);
    setPatch(p);
  }
  const layout = useMemo(() => {
    const out = new Map<string, { lane: number; count: number }>();
    for (const col of columns) {
      const events = sessions
        .filter((s) => s.date === col.date)
        .sort(
          (a, b) =>
            a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
        );
      let group: Session[] = [],
        groupEnd = "";
      const flush = () => {
        const ends: string[] = [];
        for (const event of group) {
          let lane = ends.findIndex((t) => t <= event.start);
          if (lane < 0) lane = ends.length;
          ends[lane] = event.end;
          out.set(event.id, { lane, count: 0 });
        }
        group.forEach((e) => (out.get(e.id)!.count = ends.length));
      };
      for (const e of events) {
        if (group.length && e.start >= groupEnd) {
          flush();
          group = [];
          groupEnd = "";
        }
        group.push(e);
        if (e.end > groupEnd) groupEnd = e.end;
      }
      flush();
    }
    return out;
  }, [sessions, columns]);
  // Reserve enough width for each overlapping class; the list is the compact default.
  const gridColumns = `64px ${columns
    .map((col) => {
      const lanes = Math.max(
        1,
        ...sessions
          .filter((s) => s.date === col.date)
          .map((s) => layout.get(s.id)?.count || 1),
      );
      return `${Math.max(160, lanes * 145)}px`;
    })
    .join(" ")}`;
  return (
    <AppShell
      title="Timetable"
      subtitle="Find a class. Select it to view details or make a change."
    >
      <section
        aria-label="Timetable controls"
        className="enterprise-card mb-5 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">
              {DateTime.fromISO(monday(c.weekStart)).toFormat("d LLL")} –{" "}
              {DateTime.fromISO(datePlus(monday(c.weekStart), 6)).toFormat(
                "d LLL yyyy",
              )}
            </h2>
            <p className="text-xs text-slate-500">
              Times are shown in each campus’s local time.
            </p>
          </div>
          <button
            className="btn-primary"
            disabled={!c.canWrite}
            onClick={() => setCreate(true)}
          >
            Add class
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              aria-label="Previous week"
              onClick={() => c.setWeekStart(datePlus(monday(c.weekStart), -7))}
            >
              <span aria-hidden="true">←</span>
              <span className="hidden sm:inline">Previous</span>
            </button>
            <button
              className="btn-secondary"
              onClick={() =>
                c.setWeekStart(monday(campusToday(zones[0] || "Europe/London")))
              }
            >
              This week
            </button>
            <button
              className="btn-secondary"
              aria-label="Next week"
              onClick={() => c.setWeekStart(datePlus(monday(c.weekStart), 7))}
            >
              <span className="hidden sm:inline">Next</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <div
              role="group"
              aria-label="Timetable view"
              className="flex gap-1 rounded-xl bg-slate-100 p-1"
            >
              <button
                className={
                  !agenda
                    ? "btn-secondary"
                    : "min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-600"
                }
                aria-pressed={!agenda}
                aria-controls="timetable-calendar"
                onClick={() => setAgenda(false)}
              >
                Calendar
              </button>
              <button
                className={
                  agenda
                    ? "btn-secondary"
                    : "min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-600"
                }
                aria-pressed={agenda}
                aria-controls="timetable-list"
                onClick={() => setAgenda(true)}
              >
                List
              </button>
            </div>
            <details className="relative">
              <summary className="btn-secondary cursor-pointer">Export</summary>
              <div className="absolute right-0 z-10 mt-2 grid w-52 gap-2 rounded-xl border bg-white p-3 shadow-lg">
                <button
                  className="btn-secondary"
                  onClick={() =>
                    downloadCsv("timetable.csv", timetableRows(sessions))
                  }
                >
                  Download CSV
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => downloadIcs("timetable.ics", sessions)}
                >
                  Calendar file (.ics)
                </button>
              </div>
            </details>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-3 xl:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Search classes
            <input
              aria-label="Filter timetable"
              type="search"
              className="input w-full"
              placeholder="Module, name or ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <button
            className="btn-secondary self-end xl:hidden"
            aria-expanded={filtersOpen}
            aria-controls="timetable-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters
            {[lecturer, course, room].filter(Boolean).length > 0
              ? ` (${[lecturer, course, room].filter(Boolean).length})`
              : ""}
          </button>
          <div
            id="timetable-filters"
            className={`col-span-full gap-3 sm:grid-cols-3 xl:col-span-3 xl:grid ${filtersOpen ? "grid" : "hidden"}`}
          >
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Lecturer
              <select
                aria-label="Lecturer"
                className="input w-full"
                value={lecturer}
                onChange={(e) => setLecturer(e.target.value)}
              >
                <option value="">All lecturers</option>
                {staffOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Course
              <select
                aria-label="Course"
                className="input w-full"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
              >
                <option value="">All courses</option>
                {courseOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Room
              <select
                aria-label="Room"
                className="input w-full"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              >
                <option value="">All rooms</option>
                {roomOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.room}
                    {c.campus === "All campuses" ? ` · ${r.campus}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-sm text-slate-500">
            {sessions.length} of {c.data.sessions.length} classes shown
            {filtered ? " · Filters applied" : ""}
          </p>
          {filtered && (
            <button
              type="button"
              className="min-h-9 text-sm font-semibold text-teal-700"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </div>
        {!agenda && (
          <p className="mt-2 text-xs text-slate-500">
            Scroll across to see all days. Filter by lecturer, course or room to
            focus the calendar.
          </p>
        )}
      </section>
      <div
        id="timetable-calendar"
        role="region"
        aria-label="Weekly calendar"
        tabIndex={0}
        className={`${agenda || !sessions.length ? "hidden" : ""} enterprise-card overflow-x-auto overscroll-x-contain`}
      >
        <div className="w-max min-w-full">
          <div
            className="grid border-b"
            style={{ gridTemplateColumns: gridColumns }}
          >
            <div className="sticky left-0 z-20 bg-white px-2 py-3 text-xs text-slate-500">
              Time
            </div>
            {columns.map((col) => (
              <div className="border-l px-2 py-3 text-sm" key={col.day}>
                <strong>{col.day}</strong>
                <p className="text-slate-500">{col.date}</p>
              </div>
            ))}
          </div>
          <div
            className="relative grid"
            style={{ height: 14 * 80, gridTemplateColumns: gridColumns }}
          >
            <div className="sticky left-0 z-20 bg-white">
              {Array.from({ length: 15 }, (_, i) => (
                <span
                  key={i}
                  className="absolute right-2 text-xs text-slate-500"
                  style={{ top: i * 80 - 6 }}
                >
                  {String(i + 7).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {columns.map((col, di) => (
              <div
                key={col.day}
                className="relative border-l bg-[linear-gradient(to_bottom,transparent_39px,#e2e8f0_40px)] bg-[length:100%_40px]"
                onDragOver={(e) => {
                  if (c.canWrite) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const s = sessions.find(
                    (s) => s.id === e.dataTransfer.getData("text/plain"),
                  );
                  if (!s) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const start =
                      420 + Math.round((e.clientY - rect.top) / 20) * 15,
                    end = start + minutes(s.end) - minutes(s.start);
                  if (start < 0 || end >= 24 * 60) return;
                  const fmt = (m: number) =>
                    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
                  edit(s, {
                    dayOfWeek: di + 1,
                    startLocalTime: fmt(start),
                    endLocalTime: fmt(end),
                  });
                }}
              >
                {localNow?.toISODate() === col.date &&
                  localNow.hour >= 7 &&
                  localNow.hour < 21 && (
                    <div
                      aria-label="Current local time"
                      className="pointer-events-none absolute z-10 w-full border-t-2 border-red-500"
                      style={{
                        top:
                          ((localNow.hour * 60 + localNow.minute - 420) / 60) *
                          80,
                      }}
                    >
                      <span className="bg-red-500 px-1 text-[10px] text-white">
                        {localNow.toFormat("HH:mm")}
                      </span>
                    </div>
                  )}
                {sessions
                  .filter((s) => s.date === col.date)
                  .map((s) => {
                    const lane = layout.get(s.id)!;
                    const bad = activeConflicts.some((x) =>
                      x.occurrenceIds?.includes(s.id),
                    );
                    return (
                      <button
                        key={s.id}
                        draggable={c.canWrite}
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/plain", s.id)
                        }
                        onClick={() => edit(s)}
                        className={`absolute flex flex-col items-start justify-start overflow-hidden rounded-lg border p-1.5 text-left text-xs shadow-sm ${bad ? "border-rose-300 bg-rose-50 text-rose-950" : s.variantId ? "border-amber-300 bg-amber-50 text-amber-950" : "border-teal-200 bg-teal-50 text-teal-950"}`}
                        style={{
                          top: ((minutes(s.start) - 420) / 60) * 80,
                          height: Math.max(
                            26,
                            ((minutes(s.end) - minutes(s.start)) / 60) * 80 - 3,
                          ),
                          left: `${(lane.lane / lane.count) * 100}%`,
                          width: `${100 / lane.count}%`,
                        }}
                        title={`${s.moduleName || s.moduleCode || "Untitled class"}, ${s.date} ${s.start}-${s.end}, ${s.timeZone}, ${s.room}, ${s.lecturer}`}
                      >
                        <strong className="block">
                          {s.start}-{s.end}
                        </strong>
                        <span className="block font-semibold">
                          {s.moduleName || s.moduleCode || "Untitled class"}
                        </span>
                        <span>{s.room}</span>
                        <span className="block">{s.lecturer}</span>
                        {s.variantId && (
                          <span className="font-semibold">
                            Changed · W{s.teachingWeek}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div
        id="timetable-list"
        role="region"
        aria-label="Class list"
        className={`${agenda ? "" : "hidden"} space-y-6`}
      >
        {columns.map((col) => {
          const daySessions = sessions.filter((s) => s.date === col.date);
          if (!daySessions.length) return null;
          return (
            <section key={col.date} aria-label={col.day}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="font-bold">
                  {DateTime.fromISO(col.date).toFormat("cccc, d LLL")}
                </h2>
                <span className="text-xs text-slate-500">
                  {daySessions.length}{" "}
                  {daySessions.length === 1 ? "class" : "classes"}
                </span>
              </div>
              <div className="space-y-2">
                {daySessions.map((s) => {
                  const needsReview = activeConflicts.some((x) =>
                    x.occurrenceIds?.includes(s.id),
                  );
                  return (
                    <button
                      key={s.id}
                      className="enterprise-card grid w-full gap-3 p-4 text-left transition hover:border-teal-400 hover:shadow-sm sm:grid-cols-[96px_minmax(0,1fr)_auto]"
                      onClick={() => edit(s)}
                    >
                      <span className="text-sm font-bold text-slate-700">
                        {s.start}-{s.end}
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                          {s.timeZone}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <strong className="block text-base">
                          {s.moduleName || s.moduleCode || "Untitled class"}
                        </strong>
                        <span className="mt-1 block text-sm text-slate-600">
                          {s.room} · {s.lecturer}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {[
                            courseForSession(s).name,
                            s.campus,
                            `Week ${s.teachingWeek}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-start gap-2 sm:justify-end">
                        {needsReview && (
                          <span className="badge bg-rose-50 text-rose-800">
                            Needs review
                          </span>
                        )}
                        {s.variantId && (
                          <span className="badge bg-amber-50 text-amber-800">
                            Changed
                          </span>
                        )}
                        {s.status === "Cancelled" && (
                          <span className="badge bg-slate-100 text-slate-600">
                            Cancelled
                          </span>
                        )}
                        <span className="self-center text-sm font-semibold text-teal-700">
                          View <span aria-hidden="true">→</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {!sessions.length && (
        <div className="enterprise-card mt-3 p-8 text-center">
          <h2 className="font-bold">
            {filtered
              ? "No classes match these filters"
              : "No classes this week"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {filtered
              ? "Try another lecturer, course or room, or clear the filters."
              : "Choose another week or add a class to get started."}
          </p>
          {filtered && (
            <button className="btn-secondary mt-4" onClick={clearFilters}>
              Show all classes
            </button>
          )}
        </div>
      )}
      {selected && (
        <ClassPanel
          key={selected.id}
          selected={selected}
          initialPatch={patch}
          onClose={() => setSelected(null)}
        />
      )}{" "}
      {create && (
        <RecordEditor entity="series" onClose={() => setCreate(false)} />
      )}
    </AppShell>
  );
}
