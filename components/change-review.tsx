import { DateTime } from "luxon";
import type { Session } from "@/types";
import type { ClassDifference } from "@/lib/change-review";

export function ClassSnapshot({
  session,
  empty,
}: {
  session?: Session;
  empty: string;
}) {
  if (!session) return <span className="text-slate-500">{empty}</span>;
  return (
    <div className="space-y-1">
      <p className="font-semibold">
        {DateTime.fromISO(session.date!).toFormat("ccc, d LLL yyyy")}
      </p>
      <p>
        {session.start}–{session.end}
      </p>
      {session.status === "Cancelled" && (
        <p className="font-semibold text-rose-700">Cancelled</p>
      )}
      <p>{session.room}</p>
      <p>{session.lecturer || "No lecturer assigned"}</p>
      <p className="text-xs text-slate-500">
        {session.studentIds?.length || 0}{" "}
        {session.studentIds?.length === 1 ? "student" : "students"} assigned
      </p>
    </div>
  );
}

export function ChangeReview({
  changes,
  afterLabel = "After saving",
}: {
  changes: ClassDifference[];
  afterLabel?: string;
}) {
  const students = new Set(
    changes.flatMap((r) => [
      ...(r.before?.studentIds || []),
      ...(r.after?.studentIds || []),
    ]),
  );
  function rows(items: ClassDifference[]) {
    return (
      <table className="w-full table-fixed text-left text-sm">
        <thead>
          <tr>
            <th className="w-1/2 px-2 py-2 text-slate-600">Current</th>
            <th className="w-1/2 px-2 py-2 text-slate-600">{afterLabel}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={`${r.week}-${i}`} className="border-t align-top">
              <td className="break-words px-2 py-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">
                  Week {r.week}
                </p>
                <ClassSnapshot session={r.before} empty="No class" />
              </td>
              <td className="break-words bg-teal-50/60 px-2 py-3">
                <p className="mb-2 text-xs font-semibold text-teal-700">
                  Week {r.week}
                </p>
                <ClassSnapshot session={r.after} empty="Class removed" />
                {r.before &&
                  r.after &&
                  [
                    ...new Set([
                      ...(r.before.studentIds || []),
                      ...(r.after.studentIds || []),
                    ]),
                  ].some(
                    (id) =>
                      r.before!.studentIds?.includes(id) !==
                      r.after!.studentIds?.includes(id),
                  ) && (
                    <p className="mt-2 font-medium text-teal-800">
                      Student selection changes
                    </p>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <section
      aria-label="Change summary"
      className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3"
    >
      <h3 className="font-bold">
        {changes.length
          ? `${changes.length} ${changes.length === 1 ? "class" : "classes"} affected`
          : "No class details change"}
      </h3>
      {changes.length > 0 && (
        <>
          <p className="mb-3 mt-1 text-xs text-slate-600">
            Weeks {[...new Set(changes.map((r) => r.week))].join(", ")} ·{" "}
            {students.size} assigned{" "}
            {students.size === 1 ? "student" : "students"} · Times are local to
            the campus.
          </p>
          {rows(changes.slice(0, 3))}
          {changes.length > 3 && (
            <details className="mt-3">
              <summary className="cursor-pointer py-2 text-sm font-semibold text-teal-800">
                Show {changes.length - 3} more affected classes
              </summary>
              {rows(changes.slice(3))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
