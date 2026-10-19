"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock3,
  Database,
  FileBarChart,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  MessageSquareText,
  Send,
  Settings,
  Siren,
  UserRoundCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCampusData, type BackendStatus } from "@/components/data-context";

type Section = {
  label: string;
  primary?: boolean;
  items: { href: string; label: string; icon: typeof CalendarDays }[];
};

export const sections: Section[] = [
  {
    label: "Everyday work",
    primary: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/timetable", label: "Timetable", icon: CalendarDays },
      { href: "/planning", label: "Plan teaching", icon: ClipboardList },
      { href: "/conflicts", label: "Conflicts", icon: Siren },
      { href: "/publication", label: "Review & publish", icon: Send },
    ],
  },
  {
    label: "Courses, people & rooms",
    items: [
      { href: "/programmes", label: "Programmes & Modules", icon: LibraryBig },
      { href: "/lecturers", label: "Staff", icon: UserRoundCog },
      { href: "/students", label: "Students", icon: GraduationCap },
      { href: "/rooms", label: "Locations", icon: Building2 },
    ],
  },
  {
    label: "Calendar & availability",
    items: [
      { href: "/calendar", label: "Academic Calendar", icon: CalendarDays },
      { href: "/availability", label: "Availability", icon: Clock3 },
    ],
  },
  {
    label: "Reports & history",
    items: [
      { href: "/reports", label: "Reports", icon: FileBarChart },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/changes", label: "Change history", icon: Clock3 },
    ],
  },
  {
    label: "More tools",
    items: [
      { href: "/import", label: "Data Import", icon: Database },
      { href: "/suggestions", label: "Suggestions", icon: MessageSquareText },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data, backendStatus } = useCampusData();
  const activeConflicts = data.conflicts.filter(
    (conflict) => !conflict.resolved,
  ).length;
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const links = (section: Section) =>
    section.items.map((item) => {
      const active = isActive(item.href),
        Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white",
            active && "bg-white/10 text-white ring-1 ring-white/20",
          )}
        >
          <Icon size={18} className="shrink-0" />
          <span className="flex-1">{item.label}</span>
          {item.href === "/conflicts" && activeConflicts > 0 && (
            <span className="rounded-full bg-rose-300/15 px-2 py-0.5 text-xs text-rose-200">
              {activeConflicts}
            </span>
          )}
        </Link>
      );
    });
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/10 bg-navy text-white lg:block">
      <Link
        href="/dashboard"
        className="flex h-20 items-center gap-3 border-b border-white/10 px-6"
      >
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-tealBrand">
          <CalendarDays size={22} />
        </div>
        <div>
          <p className="text-sm text-teal-100">Campus</p>
          <p className="font-semibold leading-tight">Timetable Intelligence</p>
        </div>
      </Link>
      <nav
        aria-label="Main navigation"
        className="h-[calc(100vh-5rem)] space-y-3 overflow-y-auto px-4 pb-40 pt-5"
      >
        {sections.map((section) =>
          section.primary ? (
            <div key={section.label} className="mb-5">
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                {section.label}
              </p>
              <div className="space-y-1">{links(section)}</div>
            </div>
          ) : (
            <details
              key={section.label}
              open={section.items.some((i) => isActive(i.href)) || undefined}
              className="border-t border-white/10 pt-2"
            >
              <summary className="cursor-pointer px-3 py-3 text-sm font-medium text-slate-300 hover:text-white">
                {section.label}
              </summary>
              <div className="space-y-1 pb-2">{links(section)}</div>
            </details>
          ),
        )}
      </nav>
      <div className="absolute bottom-5 left-4 right-4 rounded-2xl bg-slate-800 p-4 ring-1 ring-white/10">
        <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Bell size={16} /> Status
          </span>
          <span className="text-xs text-teal-200">
            {statusLabel(backendStatus)}
          </span>
        </div>
        <Link
          href="/conflicts"
          className="text-xs leading-5 text-slate-300 underline-offset-4 hover:underline"
        >
          {activeConflicts
            ? `${activeConflicts} conflicts to review`
            : "No active conflicts this week"}
        </Link>
      </div>
    </aside>
  );
}
function statusLabel(status: BackendStatus) {
  if (status === "Connected") return "Connected";
  if (status === "Connecting") return "Connecting";
  if (status === "Syncing") return "Saving";
  return "Read only";
}
