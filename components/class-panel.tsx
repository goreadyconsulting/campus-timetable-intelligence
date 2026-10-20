"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import type { Session } from "@/types";
import type { ScheduleVariant, SeriesPatch } from "@/types/scheduling";
import { seriesOccurrences } from "@/lib/change-review";
import { variantDates } from "@/lib/recurrence";
import { useCampusData } from "./data-context";
import { Modal, FormError } from "./modal";
import { ScopedChange, type ClassAction } from "./scoped-change";
import { RevertChange } from "./revert-change";
import { RecordEditor } from "./record-editor";

export function ClassPanel({
  selected,
  initialPatch = {},
  onClose,
}: {
  selected: Session;
  initialPatch?: SeriesPatch;
  onClose: () => void;
}) {
  const c = useCampusData(),
    d = c.rawData;
  const [edit, setEdit] = useState<{
    action: ClassAction;
    saved?: boolean;
  } | null>(Object.keys(initialPatch).length ? { action: "move" } : null);
  const [draftPatch, setDraftPatch] = useState(initialPatch);
  const [revert, setRevert] = useState<ScheduleVariant | null>(null);
  const [editPattern, setEditPattern] = useState(false);
  const result = useMemo(() => {
    try {
      const rows = seriesOccurrences(d, selected.seriesId!);
      return {
        occurrence:
          rows.find((o) => o.id === selected.id) ||
          (!selected.id.includes("+")
            ? rows.find(
                (o) =>
                  o.teachingWeek === selected.teachingWeek &&
                  !o.id.includes("+"),
              )
            : undefined),
        error: "",
      };
    } catch (e) {
      return { occurrence: undefined, error: (e as Error).message };
    }
  }, [d, selected]);
  const occurrence = result.occurrence;
  const variant = occurrence?.variantId
    ? d.variants?.find((v) => v.id === occurrence.variantId && !v.archived)
    : undefined;
  const series = d.series?.find((s) => s.id === selected.seriesId);
  const programme = d.programmes?.find((p) => p.id === series?.programmeId);
  const conflicts = c.data.conflicts.filter(
    (x) => x.occurrenceIds?.includes(occurrence?.id || "") && !x.resolved,
  );

  if (editPattern && series)
    return (
      <RecordEditor
        entity="series"
        record={series}
        onClose={() => setEditPattern(false)}
      />
    );
  if (revert)
    return (
      <RevertChange
        variant={revert}
        placement="side"
        onClose={onClose}
        onBack={() => setRevert(null)}
        onReverted={() => setRevert(null)}
      />
    );
  if (edit && occurrence)
    return (
      <ScopedChange
        occurrence={occurrence}
        initialPatch={draftPatch}
        initialAction={edit.action}
        existing={
          variant &&
          (edit.saved ||
            variant.scope === "single_occurrence" ||
            variant.operation === "additional_session")
            ? variant
            : undefined
        }
        placement="side"
        onClose={onClose}
        onBack={() => {
          setEdit(null);
          setDraftPatch({});
        }}
        onSaved={() => {
          setEdit(null);
          setDraftPatch({});
        }}
      />
    );

  return (
    <Modal title="Class details" placement="side" onClose={onClose}>
      <h3 className="text-xl font-bold">
        {occurrence?.moduleName || selected.moduleName}
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        {programme?.name || selected.course} · {selected.campus}
      </p>
      <FormError message={result.error} />
      {!occurrence && !result.error && (
        <p role="status" className="mt-4 rounded-xl bg-teal-50 p-4">
          This class is no longer scheduled. Close this panel to return to the
          timetable.
        </p>
      )}
      {occurrence && (
        <>
          <div className="my-5 rounded-xl bg-slate-50 p-4">
            <p className="font-bold">
              {DateTime.fromISO(occurrence.date!).toFormat("cccc, d LLL yyyy")}
            </p>
            <p className="mt-1 text-lg">
              {occurrence.start}–{occurrence.end}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Week {occurrence.teachingWeek} · {occurrence.timeZone}
            </p>
            {occurrence.status === "Cancelled" && (
              <p className="mt-2 font-semibold text-rose-700">Cancelled</p>
            )}
          </div>
          <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
            <dt className="text-slate-500">Room</dt>
            <dd className="font-medium">{occurrence.room}</dd>
            <dt className="text-slate-500">Lecturer</dt>
            <dd className="font-medium">
              {occurrence.lecturer || "Not assigned"}
            </dd>
            <dt className="text-slate-500">Students</dt>
            <dd>
              {occurrence.studentIds?.length || 0} assigned ·{" "}
              {occurrence.enrolled} planned
            </dd>
          </dl>
          {(occurrence.studentIds?.length || 0) > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer py-2 font-semibold text-teal-700">
                View students
              </summary>
              <ul className="max-h-40 space-y-2 overflow-auto py-2">
                {occurrence.studentIds!.map((id) => (
                  <li key={id}>
                    {d.students?.find((s) => s.id === id)?.name || id} · {id}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {conflicts.length > 0 && (
            <section className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-900">
              <h4 className="font-bold">
                {conflicts.length}{" "}
                {conflicts.length === 1 ? "conflict needs" : "conflicts need"}{" "}
                review
              </h4>
              {conflicts.map((x) => (
                <p key={x.id || x.fingerprint} className="mt-2">
                  {x.description}
                </p>
              ))}
            </section>
          )}
          {occurrence.status !== "Cancelled" && (
            <section className="mt-6">
              <h4 className="mb-3 font-semibold">
                What would you like to change?
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["move", "Move class"],
                    ["room", "Change room"],
                    ["lecturer", "Change lecturer"],
                    ["cancel", "Cancel class"],
                  ] as const
                ).map(([action, label]) => (
                  <button
                    key={action}
                    className="btn-secondary justify-start"
                    disabled={!c.canWrite}
                    onClick={() => setEdit({ action })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                className="mt-2 min-h-11 text-sm font-semibold text-teal-700"
                disabled={!c.canWrite}
                onClick={() => setEdit({ action: "all" })}
              >
                Edit all details
              </button>
            </section>
          )}
          {occurrence.status === "Cancelled" && !variant && (
            <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm">
              <p>
                This repeating class is cancelled. To restore it, open its
                settings and choose Scheduled under More options.
              </p>
              <button
                className="btn-secondary mt-3"
                disabled={!c.canWrite}
                onClick={() => setEditPattern(true)}
              >
                Edit repeating class
              </button>
            </div>
          )}
          {!c.canWrite && (
            <p className="mt-3 text-sm text-amber-800">
              Connect to shared data to make changes.
            </p>
          )}
          {variant && (
            <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
              <h4 className="font-bold">Saved change</h4>
              <p className="mt-2">{variant.reason}</p>
              <p className="mt-2 text-slate-600">
                Covers{" "}
                {series
                  ? variantDates(series, variant, d.teachingWeeks || []).length
                  : 0}{" "}
                scheduled dates.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="btn-secondary"
                  disabled={!c.canWrite}
                  onClick={() => setEdit({ action: "all", saved: true })}
                >
                  Edit saved change
                </button>
                <button
                  className="btn-secondary"
                  disabled={!c.canWrite}
                  onClick={() => setRevert(variant)}
                >
                  Revert change
                </button>
              </div>
            </section>
          )}
        </>
      )}
      <Link
        href="/changes"
        onClick={onClose}
        className="mt-6 inline-block py-2 text-sm font-semibold text-teal-700 underline"
      >
        View change history
      </Link>
    </Modal>
  );
}
