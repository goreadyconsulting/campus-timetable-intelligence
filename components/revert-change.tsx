"use client";
import { useMemo, useState } from "react";
import type { ScheduleVariant } from "@/types/scheduling";
import { compareClasses } from "@/lib/change-review";
import { detectOccurrenceConflicts } from "@/lib/constraints";
import { resolveOccurrences } from "@/lib/recurrence";
import { datePlus } from "@/lib/academic";
import { useCampusData } from "./data-context";
import { Modal, FormError } from "./modal";
import { ChangeReview } from "./change-review";

export function RevertChange({
  variant,
  onClose,
  onBack,
  onReverted,
  placement = "center",
}: {
  variant: ScheduleVariant;
  onClose: () => void;
  onBack?: () => void;
  onReverted?: () => void;
  placement?: "center" | "side";
}) {
  const c = useCampusData();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = c.rawData.variants?.find(
    (v) => v.id === variant.id && !v.archived,
  );
  const preview = useMemo(() => {
    try {
      if (!current)
        throw new Error(
          "This change has already been reverted. Close this panel to see the latest timetable.",
        );
      const series = c.rawData.series?.find((s) => s.id === current.seriesId);
      if (!series)
        throw new Error("The repeating class is no longer available.");
      const next = {
        ...c.rawData,
        variants: c.rawData.variants!.filter((v) => v.id !== current.id),
      };
      const start = datePlus(series.startDate, -7),
        end = datePlus(series.endDate, 7);
      const before = detectOccurrenceConflicts(
        c.rawData,
        resolveOccurrences(c.rawData, start, end),
      );
      const newConflicts = detectOccurrenceConflicts(
        next,
        resolveOccurrences(next, start, end),
      ).filter(
        (x) =>
          x.seriesIds?.includes(series.id) &&
          !before.some((old) => old.fingerprint === x.fingerprint),
      );
      return {
        changes: compareClasses(c.rawData, next, current.seriesId),
        newConflicts,
        error: "",
      };
    } catch (e) {
      return { changes: [], newConflicts: [], error: (e as Error).message };
    }
  }, [c.rawData, current]);
  return (
    <Modal
      title="Revert this change?"
      placement={placement}
      busy={busy}
      onClose={onClose}
    >
      <p className="text-sm text-slate-600">
        This removes the saved change shown below. The previous applicable
        settings take effect for every date covered by it. Published timetable
        versions stay unchanged.
      </p>
      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">
        <strong>Saved reason:</strong> {current?.reason || variant.reason}
      </p>
      {!preview.error && (
        <ChangeReview changes={preview.changes} afterLabel="After reverting" />
      )}
      {preview.newConflicts.length > 0 && (
        <div
          role="status"
          className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
        >
          <strong>
            {preview.newConflicts.length} new conflicts would need review.
          </strong>
          {preview.newConflicts.slice(0, 5).map((x) => (
            <p key={x.fingerprint}>
              {x.time}: {x.type}
            </p>
          ))}
        </div>
      )}
      <FormError message={error || preview.error} />
      <div className="sticky bottom-0 mt-4 flex justify-end gap-2 border-t bg-white py-4">
        <button
          className="btn-secondary"
          disabled={busy}
          onClick={onBack || onClose}
        >
          {onBack ? "Back to class" : "Keep change"}
        </button>
        <button
          className="btn-primary"
          disabled={busy || !c.canWrite || !!preview.error}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await c.mutate([
                {
                  entity: "variants",
                  id: current!.id,
                  expectedRevision: current!.revision,
                  operation: "delete",
                  reason: "Reverted class change",
                },
              ]);
              if (onReverted) onReverted();
              else onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Reverting…" : "Revert change"}
        </button>
      </div>
    </Modal>
  );
}
