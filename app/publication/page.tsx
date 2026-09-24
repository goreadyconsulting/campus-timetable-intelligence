"use client";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useCampusData } from "@/components/data-context";
import { Field, FormError } from "@/components/modal";
import { publicationReadiness } from "@/lib/domain";
import { resolveOccurrences } from "@/lib/recurrence";
import { downloadCsv, timetableRows, downloadIcs } from "@/lib/export";
import type { PublicationSnapshot } from "@/types/scheduling";
export default function Publication() {
  const c = useCampusData(),
    y = c.rawData.academicYears?.find((y) => y.id === c.academicYearId);
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [notes, setNotes] = useState(""),
    [name, setName] = useState("Timetabling team"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [snapshot, setSnapshot] = useState<PublicationSnapshot | null>(null);
  const startDate = start || y?.startDate || "",
    endDate = end || y?.endDate || "",
    campusIds = (c.rawData.campuses || [])
      .filter(
        (x) =>
          !x.archived &&
          x.active &&
          (c.campus === "All campuses" || x.name === c.campus),
      )
      .map((x) => x.id);
  const check = useMemo(() => {
    try {
      return {
        ...publicationReadiness(
          c.rawData,
          startDate,
          endDate,
          campusIds,
          c.academicYearId,
        ),
        error: "",
      };
    } catch (e) {
      return {
        ready: false,
        sessions: [],
        conflicts: [],
        missing: [],
        error: (e as Error).message,
      };
    }
  }, [c.rawData, startDate, endDate, c.campus, c.academicYearId]);
  const state = c.rawData.publication?.status || "Draft";
  async function action(status: string) {
    setBusy(true);
    setError("");
    try {
      await c.run(
        status === "Published"
          ? {
              action: "publish",
              expectedDataRevision: c.rawData.dataRevision,
              scope: {
                startDate,
                endDate,
                campusIds,
                academicYearId: c.academicYearId,
                notes,
                publishedBy: name,
              },
            }
          : {
              action: "review",
              status,
              notes,
              expectedDataRevision: c.rawData.dataRevision,
            },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const historical = snapshot
    ? resolveOccurrences(
        snapshot.data,
        snapshot.publication.startDate,
        snapshot.publication.endDate,
        true,
      ).filter(
        (s) =>
          snapshot.publication.campusIds.includes(s.campusId!) &&
          s.academicYearId === snapshot.publication.academicYearId,
      )
    : [];
  const current = snapshot
    ? resolveOccurrences(
        c.rawData,
        snapshot.publication.startDate,
        snapshot.publication.endDate,
        true,
      ).filter(
        (s) =>
          snapshot.publication.campusIds.includes(s.campusId!) &&
          s.academicYearId === snapshot.publication.academicYearId,
      )
    : [];
  const signature = (s: any) =>
    JSON.stringify([
      s.date,
      s.start,
      s.end,
      s.locationId,
      s.staffIds,
      s.studentIds,
      s.status === "Cancelled",
    ]);
  const diff = [
    ...new Set([...historical.map((s) => s.id), ...current.map((s) => s.id)]),
  ].flatMap((id) => {
    const before = historical.find((s) => s.id === id),
      after = current.find((s) => s.id === id);
    return signature(before || {}) === signature(after || {})
      ? []
      : [
          {
            id,
            name: after?.moduleName || before?.moduleName,
            type: !before
              ? "Added"
              : !after || after.status === "Cancelled"
                ? "Cancelled"
                : "Changed",
            before: before
              ? `${before.date} ${before.start}-${before.end} ${before.room}`
              : "",
            after: after
              ? `${after.date} ${after.start}-${after.end} ${after.room}`
              : "",
          },
        ];
  });
  return (
    <AppShell
      title="Review & Publication"
      subtitle="Approve shared revisions and release immutable timetable versions"
    >
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="enterprise-card p-5">
          <div className="flex justify-between">
            <h2 className="text-lg font-bold">Working timetable</h2>
            <span className="badge bg-teal-50 text-teal-800">{state}</span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Publish from">
              <input
                className="input"
                type="date"
                value={startDate}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Publish until">
              <input
                className="input"
                type="date"
                value={endDate}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
            <Field label="Published by">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <div className="self-end text-sm">
              {c.campus} · {y?.name}
            </div>
            <div className="sm:col-span-2">
              <Field label="Review and release notes">
                <textarea
                  className="input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <div
            className={`my-4 rounded-xl p-4 ${check.ready ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}
          >
            <strong>
              {check.ready ? "Ready for release checks" : "Needs attention"}
            </strong>
            <p className="mt-1 text-sm">
              {check.sessions.length} dated sessions · {check.conflicts.length}{" "}
              hard conflicts · {check.missing.length} incomplete activity
              requirements
            </p>
            {check.conflicts.slice(0, 6).map((x) => (
              <p key={x.id} className="mt-1 text-xs">
                {x.type}: {x.time}
              </p>
            ))}
            {check.missing.slice(0, 6).map((x, i) => (
              <p className="mt-1 text-xs" key={i}>
                {x}
              </p>
            ))}
          </div>
          <FormError message={error || check.error} />
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              disabled={busy || !c.canWrite || state === "In Review"}
              onClick={() => void action("In Review")}
            >
              Submit for review
            </button>
            <button
              className="btn-secondary"
              disabled={busy || !c.canWrite || state !== "In Review"}
              onClick={() => void action("Approved")}
            >
              Approve current revision
            </button>
            <button
              className="btn-primary"
              disabled={
                busy ||
                !c.canWrite ||
                state !== "Approved" ||
                !check.ready ||
                !name.trim()
              }
              onClick={() => void action("Published")}
            >
              Publish version
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Changes after approval return the working timetable to Draft.
            Previously published versions remain unchanged.
          </p>
        </div>
        <div className="enterprise-card p-5">
          <h2 className="text-lg font-bold">Published versions</h2>
          {!(c.rawData.publications || []).length && (
            <p className="mt-4 text-sm text-slate-500">
              No immutable versions have been published yet.
            </p>
          )}
          {[...(c.rawData.publications || [])].reverse().map((p) => (
            <button
              className="mt-3 block w-full rounded-xl border p-4 text-left hover:bg-slate-50"
              key={p.id}
              onClick={async () => {
                try {
                  setSnapshot(
                    await c.read("publicationSnapshot", { id: p.id }),
                  );
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <strong>Version {p.version}</strong>
              <p className="text-sm">
                {p.startDate} to {p.endDate} · {p.sessionCount} sessions
              </p>
              <p className="text-xs text-slate-500">
                {p.publishedAt} · {p.publishedBy}
              </p>
              <p className="mt-1 text-sm">{p.notes}</p>
            </button>
          ))}
        </div>
      </div>
      {snapshot && (
        <div className="enterprise-card mt-6 overflow-hidden">
          <div className="flex flex-wrap justify-between gap-3 p-5">
            <div>
              <h2 className="font-bold">
                Version {snapshot.publication.version} compared with working
                data
              </h2>
              <p className="text-sm text-slate-500">
                {diff.length} differences in the published scope
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-secondary"
                onClick={() =>
                  downloadCsv(
                    `published-v${snapshot.publication.version}.csv`,
                    timetableRows(historical),
                  )
                }
              >
                Published CSV
              </button>
              <button
                className="btn-secondary"
                onClick={() =>
                  downloadIcs(
                    `published-v${snapshot.publication.version}.ics`,
                    historical,
                  )
                }
              >
                Published calendar
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th>Change</th>
                  <th>Module</th>
                  <th>Published</th>
                  <th>Working</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((x) => (
                  <tr key={x.id}>
                    <td>{x.type}</td>
                    <td>{x.name}</td>
                    <td>{x.before}</td>
                    <td>{x.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
