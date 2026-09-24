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
