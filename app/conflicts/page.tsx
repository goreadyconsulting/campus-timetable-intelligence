"use client";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useCampusData } from "@/components/data-context";
import { ScopedChange } from "@/components/scoped-change";
import { Modal, Field, FormError } from "@/components/modal";
import type { Conflict, Session } from "@/types";
import { roomTypeMatches } from "@/lib/constraints";
export default function Conflicts() {
  const c = useCampusData();
  const [selected, setSelected] = useState<Session | null>(null),
    [locationId, setLocationId] = useState(""),
    [review, setReview] = useState<Conflict | null>(null),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("All");
  const rows = c.data.conflicts.filter(
    (x) => filter === "All" || x.severity === filter,
  );
  return (
    <AppShell
      title="Conflict Alerts"
      subtitle="Resolve constraints in the timetable; acknowledgement keeps the issue visible"
    >
      <div className="mb-4 flex gap-3">
        <select
          aria-label="Severity"
          className="input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["All", "Critical", "High", "Medium"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="badge bg-red-50 text-red-800">
          {rows.length} active constraints
        </span>
      </div>
      <div className="space-y-3">
        {rows.map((x) => {
          const s = c.data.sessions.find((s) =>
              x.occurrenceIds?.includes(s.id),
            ),
            module = c.rawData.modules.find((m) => m.id === s?.moduleId);
          const rooms = s
            ? c.rawData.rooms.filter(
                (r) =>
                  !r.archived &&
                  r.status !== "Maintenance" &&
                  r.campus === s.campus &&
                  r.id !== s.locationId &&
                  r.capacity >= s.enrolled &&
                  roomTypeMatches(r.type, module?.roomTypeRequired),
              )
            : [];
          return (
            <div className="enterprise-card p-5" key={x.id}>
              <div className="flex justify-between gap-3">
                <h2 className="font-bold">{x.type}</h2>
                <span
                  className={`badge ${x.severity === "Medium" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"}`}
                >
                  {x.severity} · {x.resolutionStatus}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {x.module} · {x.time}
              </p>
              <p className="mt-3 text-sm">{x.description}</p>
              {x.resolutionNote && (
                <p className="mt-2 text-sm text-slate-500">
                  Acknowledged: {x.resolutionNote}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {s && (
                  <button
                    className="btn-primary"
                    disabled={!c.canWrite}
                    onClick={() => {
                      setSelected(s);
                      setLocationId("");
                    }}
                  >
                    Change time or allocation
                  </button>
                )}
                {s &&
                  rooms.slice(0, 2).map((r) => (
                    <button
                      className="btn-secondary"
                      key={r.id}
                      disabled={!c.canWrite}
                      onClick={() => {
                        setSelected(s);
                        setLocationId(r.id!);
                      }}
                    >
                      Preview {r.room}
                    </button>
                  ))}
                <button
                  className="btn-secondary"
                  disabled={!c.canWrite}
                  onClick={() => {
                    setReview(x);
                    setNote(x.resolutionNote || "");
                    setError("");
                  }}
                >
                  Acknowledge with note
                </button>
              </div>
            </div>
          );
        })}
        {!rows.length && !c.resolutionError && (
          <p className="enterprise-card p-10 text-center">
            No conflicts detected for this week and campus scope.
          </p>
        )}
      </div>
      {selected && (
        <ScopedChange
          occurrence={selected}
          initialPatch={locationId ? { locationId } : {}}
          onClose={() => setSelected(null)}
        />
      )}
      {review && (
        <Modal
          title="Acknowledge conflict"
          busy={busy}
          onClose={() => setReview(null)}
        >
          <p className="mb-4 text-sm">
            This records your review. Hard constraints continue to block
            publication until the underlying allocation changes.
          </p>
          <Field label="Review note">
            <textarea
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <FormError message={error} />
          <button
            className="btn-primary mt-4"
            disabled={busy || !note.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const existing = c.rawData.conflictReviews?.find(
                  (r) => r.fingerprint === review.fingerprint && !r.archived,
                );
                await c.save("conflictReviews", {
                  ...existing,
                  fingerprint: review.fingerprint,
                  note,
                });
                setReview(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save acknowledgement
          </button>
        </Modal>
      )}
    </AppShell>
  );
}
