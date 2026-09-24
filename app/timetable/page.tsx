"use client";
import { useMemo, useState, useEffect } from "react";
import { DateTime } from "luxon";
import { AppShell } from "@/components/app-shell";
import { useCampusData } from "@/components/data-context";
import { ScopedChange } from "@/components/scoped-change";
import { RecordEditor } from "@/components/record-editor";
import { datePlus, days, monday } from "@/lib/academic";
import { minutes } from "@/lib/constraints";
import { downloadCsv, timetableRows, downloadIcs } from "@/lib/export";
import type { Session } from "@/types";
import type { SeriesPatch } from "@/types/scheduling";
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
    [agenda, setAgenda] = useState(false),
    [create, setCreate] = useState(false);
  const sessions = c.data.sessions.filter((s) =>
    JSON.stringify([
      s.moduleCode,
      s.moduleName,
      s.lecturer,
      s.room,
      s.studentIds,
      s.course,
    ])
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
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
  return (
    <AppShell
      title="Timetable"
      subtitle="Dated teaching in each campus’s local time"
    >
      <div className="mb-5 flex flex-wrap justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => c.setWeekStart(datePlus(monday(c.weekStart), -7))}
          >
            Previous week
          </button>
          <button
            className="btn-secondary"
            onClick={() => c.setWeekStart(datePlus(monday(c.weekStart), 7))}
          >
            Next week
          </button>
          <button
            className="btn-secondary"
            onClick={() => setAgenda((x) => !x)}
          >
            {agenda ? "Calendar" : "Agenda"}
          </button>
          <input
            aria-label="Filter timetable"
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Module, staff, student ID or location"
          />
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={() =>
              downloadCsv("timetable.csv", timetableRows(sessions))
            }
          >
            CSV
          </button>
          <button
            className="btn-secondary"
            onClick={() => downloadIcs("timetable.ics", sessions)}
          >
            Calendar export
          </button>
          <button
            className="btn-primary"
            disabled={!c.canWrite}
            onClick={() => setCreate(true)}
          >
            Add teaching
          </button>
        </div>
      </div>
      <div
        className={`${agenda ? "hidden" : "hidden md:block"} enterprise-card overflow-x-auto`}
      >
        <div className="min-w-[1100px]">
          <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b">
            <div />
            {columns.map((col) => (
              <div className="border-l px-2 py-3 text-sm" key={col.day}>
                <strong>{col.day}</strong>
                <p className="text-slate-500">{col.date}</p>
              </div>
            ))}
          </div>
          <div
            className="relative grid grid-cols-[60px_repeat(7,minmax(0,1fr))]"
            style={{ height: 14 * 80 }}
          >
            <div className="relative">
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
                    const bad = c.data.conflicts.some((x) =>
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
                        title={`${s.moduleName}, ${s.date} ${s.start}-${s.end}, ${s.timeZone}, ${s.room}, ${s.lecturer}`}
                      >
                        <strong className="block">
                          {s.start}-{s.end}
                        </strong>
                        <span className="block font-semibold">
                          {s.moduleName}
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
      <div className={`${agenda ? "" : "md:hidden"} space-y-3`}>
        {sessions.map((s) => (
          <button
            className="enterprise-card block w-full p-4 text-left"
            key={s.id}
            onClick={() => edit(s)}
          >
            <div className="flex justify-between">
              <strong>{s.moduleName}</strong>
              <span className="badge bg-teal-50 text-teal-800">
                {s.variantId ? "Changed" : "Base"}
              </span>
            </div>
            <p className="mt-2 text-sm">
              {s.day} {s.date} · {s.start}-{s.end} {s.timeZone}
            </p>
            <p className="text-sm text-slate-500">
              {s.room} · {s.lecturer} · {s.campus} · Week {s.teachingWeek}
            </p>
          </button>
        ))}
      </div>
      {!sessions.length && (
        <p className="enterprise-card mt-3 p-10 text-center text-slate-500">
          No teaching matches this week and these filters.
        </p>
      )}
      {selected && (
        <ScopedChange
          occurrence={selected}
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
