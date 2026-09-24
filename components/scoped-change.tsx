"use client";
import { useMemo, useState } from "react";
import type { Session } from "@/types";
import type {
  ScheduleVariant,
  SeriesPatch,
  VariantScope,
} from "@/types/scheduling";
import { useCampusData } from "./data-context";
import { Modal, Field, FormError } from "./modal";
import { days, parseWeeks } from "@/lib/academic";
import { assertRecord } from "@/lib/validation";
import { variantDates, baseDates, resolveOccurrences } from "@/lib/recurrence";
import { detectOccurrenceConflicts } from "@/lib/constraints";
export function ScopedChange({
  occurrence,
  onClose,
  initialPatch = {},
  existing,
}: {
  occurrence: Session;
  onClose: () => void;
  initialPatch?: SeriesPatch;
  existing?: ScheduleVariant;
}) {
  const c = useCampusData(),
    d = c.rawData,
    s = d.series!.find((s) => s.id === occurrence.seriesId)!;
  const [scope, setScope] = useState<VariantScope | "entire_series">(
      existing?.scope || "single_occurrence",
    ),
    [operation, setOperation] = useState(existing?.operation || "override"),
    [patch, setPatch] = useState<SeriesPatch>({
      ...occurrence.base,
      dayOfWeek: days.indexOf(occurrence.day) + 1,
      startLocalTime: occurrence.start,
      endLocalTime: occurrence.end,
      locationId: occurrence.locationId,
      staffIds: occurrence.staffIds,
      studentIds: occurrence.studentIds,
      ...existing?.patch,
      ...initialPatch,
    }),
    [weeks, setWeeks] = useState(
      (existing?.teachingWeeks || [occurrence.teachingWeek]).join(", "),
    ),
    [start, setStart] = useState(
      existing?.startDate || occurrence.originalDate!,
    ),
    [end, setEnd] = useState(existing?.endDate || occurrence.originalDate!),
    [reason, setReason] = useState(existing?.reason || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const preview = useMemo(() => {
    try {
      const variant: ScheduleVariant = {
        id: existing?.id || "PREVIEW",
        seriesId: s.id,
        scope: scope === "entire_series" ? "single_occurrence" : scope,
        effectiveDate: existing?.effectiveDate || occurrence.originalDate,
        startDate: start,
        endDate: end,
        teachingWeeks:
          scope === "week_set" ? parseWeeks(weeks, s.teachingWeeks) : undefined,
        operation,
        patch,
        reason: reason || "Preview",
        status: "Draft",
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      const series = {
        ...s,
        ...patch,
        ...(operation === "cancel" ? { status: "Cancelled" as const } : {}),
      };
      if (scope === "entire_series") assertRecord(d, "series", series);
      else assertRecord(d, "variants", variant);
      const next =
        scope === "entire_series"
          ? { ...d, series: d.series!.map((x) => (x.id === s.id ? series : x)) }
          : {
              ...d,
              variants: [
                ...(d.variants || []).filter((v) => v.id !== variant.id),
                variant,
              ],
            };
      const dates =
        scope === "entire_series"
          ? baseDates(s, d.teachingWeeks || [])
          : variantDates(s, variant, d.teachingWeeks || []);
      const old = detectOccurrenceConflicts(
        d,
        resolveOccurrences(d, s.startDate, s.endDate),
      );
      const conflicts = detectOccurrenceConflicts(
        next,
        resolveOccurrences(next, s.startDate, s.endDate),
      ).filter((x) => x.seriesIds?.includes(s.id));
      return {
        variant,
        series,
        dates,
        conflicts,
        newConflicts: conflicts.filter(
          (x) => !old.some((o) => o.fingerprint === x.fingerprint),
        ),
        error: "",
      };
    } catch (e) {
      return {
        error: (e as Error).message,
        dates: [],
        conflicts: [],
        newConflicts: [],
      };
    }
  }, [
    d,
    s,
    scope,
    operation,
    patch,
    weeks,
    start,
    end,
    reason,
    existing,
    occurrence.originalDate,
  ]);
  const set = (k: keyof SeriesPatch, v: any) =>
    setPatch((p) => ({ ...p, [k]: v }));
  return (
    <Modal
      title={`Change ${occurrence.moduleName}`}
      onClose={onClose}
      busy={busy}
    >
      <p className="mb-4 text-sm text-slate-500">
        {occurrence.date} · {occurrence.start}-{occurrence.end} · {s.timeZone} ·{" "}
        {occurrence.room}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (preview.error) throw new Error(preview.error);
            if (!reason.trim())
              throw new Error("Give a reason for this change.");
            if (scope === "entire_series")
              await c.save("series", preview.series, reason);
            else
              await c.save("variants", { ...preview.variant, reason }, reason);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Apply to">
            <select
              className="input"
              value={scope}
              onChange={(e) => setScope(e.target.value as any)}
            >
              <option value="single_occurrence">This occurrence only</option>
              <option value="week_set">
                This teaching week or selected weeks
              </option>
              <option value="date_range">Date range</option>
              <option value="this_and_following">
                This and following occurrences
              </option>
              {!existing && (
                <option value="entire_series">Entire series</option>
              )}
            </select>
          </Field>
          <Field label="Action">
            <select
              className="input"
              value={operation}
              onChange={(e) => setOperation(e.target.value as any)}
            >
              <option value="override">Change allocation</option>
              <option value="cancel">Cancel teaching</option>
              {scope !== "entire_series" && (
                <option value="additional_session">Add an extra session</option>
              )}
            </select>
          </Field>
          {scope === "week_set" && (
            <Field label="Teaching weeks">
              <input
                className="input"
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
              />
            </Field>
          )}
          {scope === "date_range" && (
            <>
              <Field label="From">
                <input
                  type="date"
                  className="input"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="Until">
                <input
                  type="date"
                  className="input"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </>
          )}
          {operation !== "cancel" && (
            <>
              <Field label="Day">
                <select
                  className="input"
                  value={patch.dayOfWeek}
                  onChange={(e) => set("dayOfWeek", Number(e.target.value))}
                >
                  {days.map((day, i) => (
                    <option key={day} value={i + 1}>
                      {day}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Location">
                <select
                  className="input"
                  value={patch.locationId}
                  onChange={(e) => set("locationId", e.target.value)}
                >
                  {d.rooms
                    .filter(
                      (r) => !r.archived && r.campus === occurrence.campus,
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.room} · {r.capacity} seats · {r.type}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Start">
                <input
                  className="input"
                  type="time"
                  value={patch.startLocalTime}
                  onChange={(e) => set("startLocalTime", e.target.value)}
                />
              </Field>
              <Field label="End">
                <input
                  className="input"
                  type="time"
                  value={patch.endLocalTime}
                  onChange={(e) => set("endLocalTime", e.target.value)}
                />
              </Field>
              <Field label="Staff">
                <select
                  multiple
                  className="input"
                  value={patch.staffIds}
                  onChange={(e) =>
                    set(
                      "staffIds",
                      Array.from(e.target.selectedOptions).map((o) => o.value),
                    )
                  }
                >
                  {d.lecturers
                    .filter((l) => !l.archived)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Individual students">
                <select
                  multiple
                  className="input"
                  value={patch.studentIds}
                  onChange={(e) =>
                    set(
                      "studentIds",
                      Array.from(e.target.selectedOptions).map((o) => o.value),
                    )
                  }
                >
                  {d.students
                    ?.filter(
                      (st) => !st.archived && st.campus === occurrence.campus,
                    )
                    .map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                </select>
              </Field>
            </>
          )}
          <div className="col-span-full">
            <Field label="Reason">
              <textarea
                className="input"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <p className="font-semibold">
            {preview.dates.length} affected occurrence
            {preview.dates.length === 1 ? "" : "s"}
          </p>
          <p className="text-sm text-slate-600">
            Teaching weeks{" "}
            {[...new Set(preview.dates.map((x) => x.week.weekNumber))].join(
              ", ",
            ) || "None"}
          </p>
          {scope === "entire_series" && (
            <p className="mt-2 text-sm">
              Existing dated overrides retain their precedence over the base
              series.
            </p>
          )}
          <p className="mt-2 text-sm">
            {preview.newConflicts.length} new conflicts;{" "}
            {preview.conflicts.length} conflicts affect the resulting series.
            Draft changes can be saved; hard conflicts block publication.
          </p>
          {preview.newConflicts.slice(0, 8).map((x) => (
            <p className="mt-1 text-sm text-red-800" key={x.id}>
              {x.time}: {x.type}
            </p>
          ))}
        </div>
        <FormError message={preview.error || error} />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !c.canWrite || !!preview.error}
          >
            {busy ? "Saving…" : "Save scoped change"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
