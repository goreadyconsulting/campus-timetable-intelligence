"use client";
import Link from "next/link";
import { monday } from "@/lib/academic";
import { useState, useEffect } from "react";
import { useCampusData } from "./data-context";
import { sections } from "./sidebar";
import { Modal, Field } from "./modal";
export function Header({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const c = useCampusData();
  const [menu, setMenu] = useState(false),
    [search, setSearch] = useState(false),
    [q, setQ] = useState(""),
    [notifications, setNotifications] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearch((x) => !x);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const links = sections.flatMap((s) => s.items);
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur print:static">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            className="btn-secondary lg:hidden"
            onClick={() => setMenu(true)}
          >
            Menu
          </button>
          <button className="btn-secondary" onClick={() => setSearch(true)}>
            Search <span className="hidden xl:inline">⌘ K</span>
          </button>
          <button
            className="btn-secondary"
            onClick={() => setNotifications(true)}
          >
            Updates ({c.data.conflicts.length})
          </button>
          <span
            role="status"
            className={`badge ${c.canWrite ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
          >
            {c.backendStatus === "Connected"
              ? "Shared data connected"
              : c.backendStatus === "Syncing"
                ? "Saving"
                : c.backendStatus === "Connecting"
                  ? "Connecting"
                  : "Read only"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t bg-slate-50 px-4 py-2 lg:px-8">
        <Field label="Campus">
          <select
            className="input"
            value={c.campus}
            onChange={(e) => c.setCampus(e.target.value)}
          >
            <option>All campuses</option>
            {c.rawData.campuses
              ?.filter((x) => !x.archived)
              .map((x) => (
                <option key={x.id}>{x.name}</option>
              ))}
          </select>
        </Field>
        <Field label="Academic year">
          <select
            className="input"
            value={c.academicYearId}
            onChange={(e) => {
              c.setAcademicYearId(e.target.value);
              const y = c.rawData.academicYears?.find(
                (y) => y.id === e.target.value,
              );
              if (y) c.setWeekStart(monday(y.startDate));
            }}
          >
            {c.rawData.academicYears
              ?.filter((y) => !y.archived)
              .map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Week containing">
          <input
            className="input"
            type="date"
            value={c.weekStart}
            onChange={(e) =>
              e.target.value && c.setWeekStart(monday(e.target.value))
            }
          />
        </Field>
        <button
          className="btn-secondary print:hidden"
          disabled={
            c.backendStatus === "Connecting" || c.backendStatus === "Syncing"
          }
          onClick={() => void c.refresh().catch(() => {})}
        >
          Refresh shared data
        </button>
      </div>
      {c.error && (
        <div
          role="status"
          className="bg-amber-50 px-4 py-2 text-sm text-amber-900"
        >
          {c.error}{" "}
          {c.backendStatus === "Unavailable" &&
            "The last available data is shown. Editing is disabled."}
        </div>
      )}
      {c.resolutionError && (
        <div role="alert" className="bg-red-50 p-3 text-red-800">
          Scheduling needs attention: {c.resolutionError}
        </div>
      )}
      {c.notice && (
        <button
          onClick={() => c.setNotice("")}
          className="w-full bg-emerald-50 p-2 text-sm text-emerald-900"
        >
          {c.notice} ×
        </button>
      )}
      {menu && (
        <Modal title="Navigation" onClose={() => setMenu(false)}>
          <nav className="grid grid-cols-2 gap-2">
            {links.map((l) => (
              <Link className="btn-secondary" key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>
        </Modal>
      )}
      {search && (
        <Modal title="Find a page or record" onClose={() => setSearch(false)}>
          <input
            autoFocus
            aria-label="Search pages and records"
            className="input mb-4 w-full"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="grid gap-2">
            {links
              .filter((l) => l.label.toLowerCase().includes(q.toLowerCase()))
              .map((l) => (
                <Link
                  key={l.href}
                  className="rounded-xl bg-slate-50 p-3"
                  href={l.href}
                >
                  {l.label}
                </Link>
              ))}
            {q &&
              [
                ...c.rawData.modules.map((m) => ({
                  id: m.id,
                  name: `${m.code} ${m.name}`,
                  href: "/programmes",
                })),
                ...(c.rawData.students || []).map((s) => ({
                  id: s.id,
                  name: s.name,
                  href: "/students",
                })),
                ...c.rawData.lecturers.map((s) => ({
                  id: s.id,
                  name: s.name,
                  href: "/lecturers",
                })),
                ...c.rawData.rooms.map((s) => ({
                  id: s.id,
                  name: s.room,
                  href: "/rooms",
                })),
              ]
                .filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))
                .slice(0, 15)
                .map((r) => (
                  <Link
                    className="rounded-xl bg-slate-50 p-3"
                    key={r.id}
                    href={`${r.href}?q=${encodeURIComponent(q)}`}
                  >
                    {r.name}
                  </Link>
                ))}
          </div>
        </Modal>
      )}
      {notifications && (
        <Modal
          title="Operational updates"
          onClose={() => setNotifications(false)}
        >
          <Link className="btn-secondary" href="/conflicts">
            Review {c.data.conflicts.length} conflicts this week
          </Link>
          <p className="my-3">
            Publication: {c.rawData.publication?.status || "Draft"}.{" "}
            {c.rawData.variants?.filter(
              (v) => !v.archived && v.status === "Draft",
            ).length || 0}{" "}
            draft changes.
          </p>
          <div className="space-y-2">
            {c.rawData.audit?.slice(0, 12).map((a) => (
              <div className="rounded-xl bg-slate-50 p-3 text-sm" key={a.id}>
                {a.action} · {a.entityType} · {a.timestamp}
                <p>{a.reason}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </header>
  );
}
