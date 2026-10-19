"use client";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { useCampusData } from "@/components/data-context";
import { minutes } from "@/lib/constraints";
export default function Dashboard() {
  const c = useCampusData();
  const active = c.data.sessions.filter((s) => s.status !== "Cancelled");
  const stats = [
    ["Teaching sessions", active.length, "/timetable"],
    [
      "Teaching hours",
      Math.round(
        active.reduce(
          (n, s) => n + (minutes(s.end) - minutes(s.start)) / 60,
          0,
        ) * 10,
      ) / 10,
      "/analytics",
    ],
    ["Conflicts to review", c.data.conflicts.length, "/conflicts"],
    [
      "Draft changes",
      c.rawData.variants?.filter((v) => !v.archived && v.status === "Draft")
        .length || 0,
      "/changes",
    ],
  ];
  return (
    <AppShell
      title="Dashboard"
      subtitle="Teaching operations for the selected campus and week"
    >
      <section className="mb-6 rounded-2xl border border-teal-100 bg-teal-50/60 p-5 sm:p-6">
        <h2 className="text-xl font-bold">What would you like to do?</h2>
        <p className="mt-1 text-sm text-slate-600">
          Find a class, plan teaching or review what needs attention.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            [
              "/timetable",
              "View or change a class",
              "Find a lecturer, course or room in your timetable.",
            ],
            [
              "/planning",
              "Plan teaching",
              "Add teaching requirements and preview a schedule.",
            ],
            [
              "/conflicts",
              "Review conflicts",
              "Check clashes before approving the timetable.",
            ],
          ].map(([href, label, help]) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-teal-500 hover:shadow-sm"
            >
              <span className="font-semibold text-teal-800">
                {label} <span aria-hidden="true">→</span>
              </span>
              <span className="mt-2 block text-sm leading-5 text-slate-500">
                {help}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <details className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold">
          Setting up a new timetable? Start here
        </summary>
        <ol className="mt-4 grid list-inside list-decimal gap-3 text-sm sm:grid-cols-2">
          <li>
            <Link
              className="font-semibold text-teal-700 underline"
              href="/import"
            >
              Add your data
            </Link>
            <p className="mt-1 text-slate-500">
              Add courses, people and rooms, or import a file.
            </p>
          </li>
          <li>
            <Link
              className="font-semibold text-teal-700 underline"
              href="/calendar"
            >
              Check teaching dates
            </Link>
            <p className="mt-1 text-slate-500">
              Confirm terms, holidays and teaching weeks.
            </p>
          </li>
          <li>
            <Link
              className="font-semibold text-teal-700 underline"
              href="/planning"
            >
              Plan the classes
            </Link>
            <p className="mt-1 text-slate-500">
              Add requirements, check availability and preview allocations.
            </p>
          </li>
          <li>
            <Link
              className="font-semibold text-teal-700 underline"
              href="/publication"
            >
              Review and publish
            </Link>
            <p className="mt-1 text-slate-500">
              Resolve conflicts and follow the approval process.
            </p>
          </li>
        </ol>
      </details>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, value, href]) => (
          <Link key={label} href={String(href)} className="enterprise-card p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <strong className="mt-3 block text-3xl">{value}</strong>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="enterprise-card p-5">
          <div className="flex justify-between">
            <h2 className="font-bold">Teaching this week</h2>
            <Link
              className="text-sm font-semibold text-teal-700"
              href="/timetable"
            >
              Open timetable
            </Link>
          </div>
          {active.slice(0, 12).map((s) => (
            <div key={s.id} className="border-b py-3">
              <p className="font-semibold">{s.moduleName}</p>
              <p className="text-sm text-slate-500">
                {s.date} · {s.start}-{s.end} · {s.room} · {s.campus}
              </p>
            </div>
          ))}
          {!active.length && (
            <p className="py-8 text-slate-500">No teaching in this scope.</p>
          )}
        </section>
        <section className="enterprise-card p-5">
          <h2 className="font-bold">Review and recent changes</h2>
          <p className="mt-3">
            Publication:{" "}
            <strong>{c.rawData.publication?.status || "Draft"}</strong>
          </p>
          <div className="my-4 flex flex-wrap gap-2">
            <Link className="btn-secondary" href="/planning">
              Plan teaching
            </Link>
            <Link className="btn-secondary" href="/publication">
              Review publication
            </Link>
            <Link className="btn-secondary" href="/changes">
              Change history
            </Link>
          </div>
          {c.rawData.audit?.slice(0, 12).map((a) => (
            <div key={a.id} className="border-t py-3 text-sm">
              <p className="font-semibold">
                {a.action} · {a.entityType}
              </p>
              <p className="text-slate-500">
                {a.timestamp} · {a.actor}
              </p>
              <p>{a.reason}</p>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
