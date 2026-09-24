"use client";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useCampusData } from "@/components/data-context";
import { RecordEditor } from "@/components/record-editor";
import { Modal, FormError } from "@/components/modal";
import { planSchedule } from "@/lib/planner";
import { assertRecord } from "@/lib/validation";
export default function Planning() {
  const c = useCampusData();
  const [manage, setManage] = useState(false),
    [seriesEdit, setSeriesEdit] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null),
    [plan, setPlan] = useState<ReturnType<typeof planSchedule> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const rows = (c.rawData.templates || []).filter(
    (t) =>
      !t.archived &&
      t.academicYearId === c.academicYearId &&
      (c.campus === "All campuses" || t.campus === c.campus),
  );
  return (
    <AppShell
      title="Activity Planning"
      subtitle="Define teaching requirements, then preview suitable allocations"
    >
      <div className="mb-5 flex flex-wrap gap-3">
        <button className="btn-secondary" onClick={() => setManage(true)}>
          Manage recurring teaching
        </button>
        <button
          className="btn-primary"
          disabled={!c.canWrite}
          onClick={() => setEdit({})}
        >
          Add activity
        </button>
        <button
          className="btn-secondary"
          disabled={busy || !c.canWrite}
          onClick={async () => {
            setBusy(true);
            setError("");
            await new Promise((r) => setTimeout(r, 30));
            try {
              setPlan(planSchedule({ ...c.rawData, templates: rows }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Checking allocations…" : "Preview scheduling"}
        </button>
      </div>
      <FormError message={error} />
      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((t) => {
          let problem = "";
          try {
            assertRecord(c.rawData, "templates", t);
          } catch (e) {
            problem = (e as Error).message;
          }
          const series =
            c.rawData.series?.filter(
              (s) =>
                !s.archived &&
                s.status !== "Cancelled" &&
                s.activityTemplateId === t.id,
            ) || [];
          const placed = t.teachingWeeks.reduce(
              (n, w) =>
                n +
                Math.min(
                  t.weeklySessions,
                  series.filter((s) => s.teachingWeeks.includes(w)).length,
                ),
              0,
            ),
            required = t.teachingWeeks.length * t.weeklySessions;
          return (
            <div className="enterprise-card p-5" key={t.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">{t.name}</h2>
                  <p className="text-sm text-slate-500">
                    {t.moduleCode} · {t.campus}
                  </p>
                </div>
                <span
                  className={`badge ${problem ? "bg-red-50 text-red-800" : placed === required ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
                >
                  {problem
                    ? "Needs attention"
                    : placed === required
                      ? "Scheduled"
                      : placed
                        ? "Partially scheduled"
                        : "Ready"}
                </span>
              </div>
              <p className="mt-4 text-sm">
                {t.durationHours} hours × {t.weeklySessions} sessions per week ·{" "}
                {t.studentIds?.length || 0} students · {t.roomSuitability}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Weeks {t.teachingWeeks.join(", ")}
              </p>
              <p className="mt-2 text-sm font-semibold">
                {placed} / {required} teaching occurrences allocated
              </p>
              {problem && (
                <p className="mt-2 text-sm text-red-700">{problem}</p>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  className="btn-secondary"
                  disabled={!c.canWrite}
                  onClick={() => setEdit(t)}
                >
                  Edit activity
                </button>
                <button
                  className="btn-secondary"
                  disabled={!c.canWrite}
                  onClick={async () => {
                    try {
                      await c.archive("templates", t.id);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Archive
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {!rows.length && (
        <p className="enterprise-card p-10 text-center">
          No activities in this scope.
        </p>
      )}
      {edit && (
        <RecordEditor
          entity="templates"
          record={edit}
          onClose={() => setEdit(null)}
        />
      )}
      {plan && (
        <Modal
          title="Scheduling preview"
          busy={busy}
          onClose={() => setPlan(null)}
        >
          <p>
            {plan.mutations.length} new recurring series can be placed. Existing
            teaching remains in place.
          </p>
          <div className="my-4 max-h-80 overflow-auto">
            {plan.mutations.map((m, i) => (
              <p className="border-b py-2 text-sm" key={i}>
                {
                  c.rawData.modules.find((x) => x.id === m.record?.moduleId)
                    ?.name
                }{" "}
                · {String(m.record?.startLocalTime)}-
                {String(m.record?.endLocalTime)} ·{" "}
                {
                  c.rawData.rooms.find((x) => x.id === m.record?.locationId)
                    ?.room
                }
              </p>
            ))}
          </div>
          {plan.unscheduled.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-4">
              <h3 className="font-bold">Unscheduled teaching</h3>
              {plan.unscheduled.map((s, i) => (
                <p className="mt-1 text-sm" key={i}>
                  {s}
                </p>
              ))}
            </div>
          )}
          <FormError message={error} />
          <button
            className="btn-primary mt-4"
            disabled={busy || !plan.mutations.length || !c.canWrite}
            onClick={async () => {
              setBusy(true);
              try {
                await c.mutate(plan.mutations);
                setPlan(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save {plan.mutations.length} allocations
          </button>
        </Modal>
      )}
      {manage && (
        <Modal title="Recurring teaching" onClose={() => setManage(false)}>
          <div className="space-y-3">
            {c.rawData.series
              ?.filter(
                (s) =>
                  s.academicYearId === c.academicYearId &&
                  (c.campus === "All campuses" ||
                    c.rawData.campuses?.find((x) => x.id === s.campusId)
                      ?.name === c.campus),
              )
              .map((s) => (
                <div key={s.id} className="rounded-xl border p-3">
                  <strong>
                    {c.rawData.modules.find((m) => m.id === s.moduleId)?.name}
                  </strong>
                  <p className="text-sm text-slate-500">
                    {s.startLocalTime}-{s.endLocalTime} ·{" "}
                    {s.archived ? "Archived" : s.status} · Weeks{" "}
                    {s.teachingWeeks.join(", ")}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="btn-secondary"
                      disabled={!c.canWrite}
                      onClick={() => {
                        setManage(false);
                        setSeriesEdit(s);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={!c.canWrite || busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          if (s.archived)
                            await c.save("series", { ...s, archived: false });
                          else await c.archive("series", s.id);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {s.archived ? "Restore" : "Archive"}
                    </button>
                  </div>
                </div>
              ))}
          </div>
          <FormError message={error} />
        </Modal>
      )}
      {seriesEdit && (
        <RecordEditor
          entity="series"
          record={seriesEdit}
          onClose={() => setSeriesEdit(null)}
        />
      )}
    </AppShell>
  );
}
