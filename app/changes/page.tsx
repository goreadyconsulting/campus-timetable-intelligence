"use client";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useCampusData } from "@/components/data-context";
import { ScopedChange } from "@/components/scoped-change";
import { Modal, FormError } from "@/components/modal";
import { resolveOccurrences, variantDates } from "@/lib/recurrence";
import { days } from "@/lib/academic";
import type { ScheduleVariant } from "@/types/scheduling";
export default function Changes() {
  const c = useCampusData();
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("All"),
    [operation, setOperation] = useState("All"),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [edit, setEdit] = useState<ScheduleVariant | null>(null),
    [revert, setRevert] = useState<ScheduleVariant | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const rows = (c.rawData.variants || []).filter((v) => {
    const s = c.rawData.series?.find((s) => s.id === v.seriesId);
    if (!s || s.academicYearId !== c.academicYearId || v.archived || s.archived)
      return false;
    const campus = c.rawData.campuses?.find((x) => x.id === s.campusId);
    const dates = variantDates(s, v, c.rawData.teachingWeeks || []);
    const refs = [
      c.rawData.modules.find((m) => m.id === s.moduleId),
      c.rawData.programmes?.find((p) => p.id === s.programmeId),
      c.rawData.lecturers.filter((l) =>
        (v.patch.staffIds || s.staffIds).includes(l.id!),
      ),
      c.rawData.students?.filter((st) =>
        (v.patch.studentIds || s.studentIds).includes(st.id),
      ),
      c.rawData.rooms.find(
        (r) => r.id === (v.patch.locationId || s.locationId),
      ),
    ];
    return (
      (c.campus === "All campuses" || campus?.name === c.campus) &&
      (status === "All" || status === v.status) &&
      (operation === "All" || operation === v.operation) &&
      dates.some(
        (d) => (!from || d.date >= from) && (!until || d.date <= until),
      ) &&
      JSON.stringify([v, refs]).toLowerCase().includes(q.toLowerCase())
    );
  });
  const series = edit && c.rawData.series?.find((s) => s.id === edit.seriesId);
  const occurrence = series
    ? resolveOccurrences(
        c.rawData,
        series.startDate,
        series.endDate,
        true,
      ).find(
        (o) =>
          o.seriesId === series.id &&
          variantDates(series, edit!, c.rawData.teachingWeeks || []).some(
            (d) => d.date === o.originalDate,
          ),
      )
    : undefined;
  return (
    <AppShell
      title="Changes"
      subtitle="Review scoped overrides, cancellations and additional teaching"
    >
      <div className="mb-5 flex flex-wrap gap-3">
        <input
          aria-label="Search changes"
          className="input"
          placeholder="Module, staff, student, location or reason"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Change status"
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["All", "Draft", "Published"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Operation"
          className="input"
          value={operation}
          onChange={(e) => setOperation(e.target.value)}
        >
          {["All", "override", "cancel", "additional_session"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          aria-label="Changes from date"
          className="input"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          aria-label="Changes until date"
          className="input"
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
        />
      </div>
      <div className="space-y-3">
        {rows.map((v) => {
          const s = c.rawData.series!.find((s) => s.id === v.seriesId)!,
            m = c.rawData.modules.find((m) => m.id === s.moduleId);
          const dates = variantDates(s, v, c.rawData.teachingWeeks || []);
          return (
            <div key={v.id} className="enterprise-card p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="font-bold">
                    {m?.name} · {v.operation.replace("_", " ")}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {v.scope.replaceAll("_", " ")} · {dates.length} occurrences
                    · Weeks {dates.map((x) => x.week.weekNumber).join(", ")}
                  </p>
                </div>
                <span className="badge bg-amber-50 text-amber-800">
                  {v.status}
                </span>
              </div>
              <div className="my-3 grid gap-3 text-sm sm:grid-cols-2">
                <p>
                  <strong>Base:</strong> {days[s.dayOfWeek - 1]}{" "}
                  {s.startLocalTime}-{s.endLocalTime} ·{" "}
                  {c.rawData.rooms.find((r) => r.id === s.locationId)?.room}
                </p>
                <p>
                  <strong>Change:</strong>{" "}
                  {v.operation === "cancel"
                    ? "Cancelled"
                    : `${days[(v.patch.dayOfWeek || s.dayOfWeek) - 1]} ${v.patch.startLocalTime || s.startLocalTime}-${v.patch.endLocalTime || s.endLocalTime} · ${c.rawData.rooms.find((r) => r.id === (v.patch.locationId || s.locationId))?.room}`}
                </p>
              </div>
              <p className="text-sm">{v.reason}</p>
              <div className="mt-4 flex gap-2">
                <button
                  className="btn-secondary"
                  disabled={!c.canWrite}
                  onClick={() => setEdit(v)}
                >
                  Edit change
                </button>
                <button
                  className="btn-secondary"
                  disabled={!c.canWrite}
                  onClick={() => {
                    setRevert(v);
                    setError("");
                  }}
                >
                  Revert change
                </button>
              </div>
            </div>
          );
        })}
        {!rows.length && (
          <p className="enterprise-card p-10 text-center text-slate-500">
            No scoped changes match these filters.
          </p>
        )}
      </div>
      {edit && occurrence && (
        <ScopedChange
          occurrence={occurrence}
          existing={edit}
          onClose={() => setEdit(null)}
        />
      )}
      {revert && (
        <Modal
          title="Revert this change?"
          busy={busy}
          onClose={() => setRevert(null)}
        >
          <p>
            The next applicable override or the original series will be
            restored. Published snapshots remain unchanged.
          </p>
          <FormError message={error} />
          <button
            className="btn-primary mt-4"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await c.archive("variants", revert.id);
                setRevert(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Revert change
          </button>
        </Modal>
      )}
    </AppShell>
  );
}
