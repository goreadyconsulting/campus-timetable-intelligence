"use client";
import { useEffect, useState } from "react";
import { useCampusData } from "./data-context";
import { AppShell } from "./app-shell";
import { RecordEditor, entityLabels } from "./record-editor";
import { Modal, FormError } from "./modal";
import type { EntityName } from "@/types/scheduling";
import { records } from "@/lib/validation";
import { downloadCsv } from "@/lib/export";
export function MasterPage({
  title,
  subtitle,
  entities,
}: {
  title: string;
  subtitle: string;
  entities: EntityName[];
}) {
  const c = useCampusData();
  const [entity, setEntity] = useState(entities[0]),
    [q, setQ] = useState(""),
    [archived, setArchived] = useState(false),
    [edit, setEdit] = useState<any>(null),
    [detail, setDetail] = useState<any>(null),
    [confirm, setConfirm] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setQ(new URLSearchParams(location.search).get("q") || "");
  }, []);
  const rows = records(c.rawData, entity).filter(
    (r) =>
      Boolean(r.archived) === archived &&
      (c.campus === "All campuses" || !r.campus || r.campus === c.campus) &&
      (!r.academicYearId || r.academicYearId === c.academicYearId) &&
      JSON.stringify(r).toLowerCase().includes(q.toLowerCase()),
  );
  const label = (r: any) =>
    r.name ||
    r.room ||
    r.resourceName ||
    r.label ||
    c.rawData.lecturers.find((x) => x.id === r.resourceId)?.name ||
    c.rawData.rooms.find((x) => x.id === r.resourceId)?.room ||
    c.rawData.students?.find((x) => x.id === r.resourceId)?.name ||
    `${r.fromCampusId || r.studentId || r.id}${r.toCampusId ? " → " + r.toCampusId : ""}`;
  const detailText = (r: any) =>
    entity === "lecturers"
      ? `${r.primaryCampus} · ${(r.additionalCampuses || []).join(", ") || "No additional campuses"}`
      : entity === "rooms"
        ? `${r.type} · ${r.capacity} seats`
        : entity === "templates"
          ? `${r.moduleCode} · ${r.durationHours}h × ${r.weeklySessions}/week · Weeks ${(r.teachingWeeks || []).join(", ")}`
          : entity === "availabilityRules"
            ? `${r.resourceType} · ${r.timeZone} · ${r.days.reduce((n: number, d: any) => n + d.windows.length, 0)} windows`
            : entity === "campuses"
              ? `${r.timeZone} · ${r.openingTime}-${r.closingTime}`
              : entity === "teachingWeeks"
                ? `Week ${r.weekNumber} · ${r.isTeachingWeek ? "Teaching" : "No teaching"} · ${r.startDate} to ${r.endDate}`
                : r.startDate
                  ? `${r.startDate} to ${r.endDate}${r.startTime ? " · " + r.startTime + "-" + r.endTime : ""}`
                  : r.code || r.email || r.programme || "";
  return (
    <AppShell title={title} subtitle={subtitle}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {entities.map((e) => (
            <button
              key={e}
              className={entity === e ? "btn-primary" : "btn-secondary"}
              onClick={() => {
                setEntity(e);
                setQ("");
              }}
            >
              {entityLabels[e]}
            </button>
          ))}
        </div>
        <button
          className="btn-primary"
          disabled={!c.canWrite}
          onClick={() => setEdit({})}
        >
          Add {entityLabels[entity].toLowerCase()}
        </button>
      </div>
      <FormError message={error} />
      <div className="enterprise-card overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b p-4">
          <input
            aria-label="Search records"
            placeholder="Search records"
            className="input min-w-0 flex-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />{" "}
            Show archived
          </label>
          <button
            className="btn-secondary"
            onClick={() => downloadCsv(`${entity}.csv`, rows)}
          >
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th>Record</th>
                <th>Details</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button
                      className="text-left font-semibold text-teal-800 hover:underline"
                      onClick={() => setDetail(r)}
                    >
                      {label(r)}
                    </button>
                    <p className="mt-1 text-xs text-slate-500">
                      {r.campus || ""}
                    </p>
                  </td>
                  <td className="max-w-md text-sm text-slate-600">
                    {detailText(r)}
                  </td>
                  <td className="text-sm">
                    {r.archived ? "Archived" : r.status || "Active"}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary"
                        disabled={!c.canWrite}
                        onClick={() => setEdit(r)}
                      >
                        Edit
                      </button>
                      {r.archived && (
                        <button
                          className="btn-secondary"
                          disabled={!c.canWrite || busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await c.save(entity, { ...r, archived: false });
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Restore
                        </button>
                      )}
                      {!r.archived && (
                        <button
                          className="btn-secondary"
                          disabled={!c.canWrite}
                          onClick={() => {
                            setConfirm(r);
                            setError("");
                          }}
                        >
                          Archive
                        </button>
                      )}
                      {["modules", "programmes", "rooms"].includes(entity) && (
                        <button
                          className="btn-secondary"
                          disabled={!c.canWrite}
                          onClick={() =>
                            setEdit({
                              ...r,
                              id: undefined,
                              revision: undefined,
                              campus: "",
                              programmeId: "",
                              code: "",
                              name: r.name,
                            })
                          }
                        >
                          Copy
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="p-10 text-center text-slate-500">
              No records match these filters.
            </p>
          )}
        </div>
        <p className="px-4 py-3 text-xs text-slate-500">
          {rows.length} records · Shared revision {c.rawData.dataRevision}
        </p>
      </div>
      {edit && (
        <RecordEditor
          key={`${entity}-${edit.id || "new"}`}
          entity={entity}
          record={edit}
          onClose={() => setEdit(null)}
        />
      )}
      {confirm && (
        <Modal
          title={`Archive ${label(confirm)}?`}
          onClose={() => setConfirm(null)}
          busy={busy}
        >
          <p>
            Archived records remain in history. Records used by active
            timetables must be reassigned first.
          </p>
          <FormError message={error} />
          <button
            className="btn-primary mt-4"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await c.archive(entity, confirm.id);
                setConfirm(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Archive record
          </button>
        </Modal>
      )}
      {detail && (
        <Modal title={label(detail)} onClose={() => setDetail(null)}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {Object.entries(detail)
              .filter(
                ([k, v]) =>
                  !["revision", "updatedAt", "createdAt", "days"].includes(k) &&
                  v !== "" &&
                  v !== undefined,
              )
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-slate-500">
                    {k.replace(/([A-Z])/g, " $1")}
                  </dt>
                  <dd className="break-words">
                    {typeof v === "object"
                      ? Array.isArray(v)
                        ? v.join(", ")
                        : "Configured"
                      : String(v)}
                  </dd>
                </div>
              ))}
          </dl>
          <h3 className="mb-2 mt-6 font-bold">Scheduled this week</h3>
          {c.data.sessions
            .filter((s) =>
              entity === "rooms"
                ? s.locationId === detail.id
                : entity === "lecturers"
                  ? s.staffIds?.includes(detail.id)
                  : entity === "students"
                    ? s.studentIds?.includes(detail.id)
                    : entity === "modules"
                      ? s.moduleId === detail.id
                      : false,
            )
            .map((s) => (
              <div key={s.id} className="border-t py-2 text-sm">
                {s.date} {s.start}-{s.end} · {s.moduleName} · {s.room}
              </div>
            ))}
        </Modal>
      )}
    </AppShell>
  );
}
