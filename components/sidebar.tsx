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

export const sections = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Planning",
    items: [
      { href: "/programmes", label: "Programmes & Modules", icon: LibraryBig },
      { href: "/calendar", label: "Academic Calendar", icon: CalendarDays },
      { href: "/planning", label: "Activity Planning", icon: ClipboardList },
      { href: "/availability", label: "Availability", icon: Clock3 },
      { href: "/import", label: "Data Import", icon: Database },
    ],
  },
  {
    label: "Scheduling",
    items: [
      { href: "/timetable", label: "Timetable", icon: CalendarDays },
      { href: "/rooms", label: "Locations", icon: Building2 },
      { href: "/lecturers", label: "Staff", icon: UserRoundCog },
      { href: "/students", label: "Students", icon: GraduationCap },
      { href: "/conflicts", label: "Conflict Alerts", icon: Siren },
    ],
  },
  {
    label: "Review",
    items: [
      { href: "/changes", label: "Changes", icon: Clock3 },
      { href: "/publication", label: "Review & Publication", icon: Send },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/reports", label: "Reports", icon: FileBarChart },
    ],
  },
  {
    label: "Support",
    items: [
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

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/10 bg-navy text-white lg:block">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-tealBrand shadow-lg">
          <CalendarDays size={22} />
        </div>
        <div>
          <p className="text-sm text-teal-100">Campus</p>
          <h1 className="font-semibold leading-tight">
            Timetable Intelligence
          </h1>
        </div>
      </div>
      <nav className="h-[calc(100vh-5rem)] space-y-5 overflow-y-auto px-4 pb-40 pt-5">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="mb-2 px-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white",
                      active && "bg-white/12 text-white ring-1 ring-white/10",
                    )}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="absolute bottom-5 left-4 right-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Bell size={16} />
            System status
          </span>
          <span className="text-xs text-teal-200">
            {statusLabel(backendStatus)}
          </span>
        </div>
        <p className="text-xs leading-5 text-slate-300">
          {activeConflicts
            ? `${activeConflicts} conflict${activeConflicts === 1 ? "" : "s"} require review.`
            : "No active conflicts require review."}
        </p>
      </div>
    </aside>
  );
}

function statusLabel(status: BackendStatus) {
  if (status === "Connected") return "Backend online";
  if (status === "Connecting") return "Checking";
  if (status === "Syncing") return "Saving";
  return "Read only";
}
