"use client";

import { AppShell } from "@/components/app-shell";
import {
  CampusUsageChart,
  ConflictTrendChart,
  LecturerWorkloadChart,
  PeakHoursChart,
  RoomUsageChart,
} from "@/components/charts";
import { useCampusData } from "@/components/data-context";

export default function AnalyticsPage() {
  const { data, campus } = useCampusData();
  const moduleCoverage = data.modules
    .filter(
      (module) =>
        !module.archived &&
        (campus === "All campuses" || module.campus === campus),
    )
    .map((module) => {
      const scheduled = data.sessions.filter(
        (session) =>
          session.moduleId === module.id && session.status !== "Cancelled",
      ).length;
      const required = Math.max(1, module.weeklySessions || 1);
      return {
        code: module.code,
        name: module.name,
        scheduled,
        required,
        percentage: Math.min(100, Math.round((scheduled / required) * 100)),
      };
    })
    .sort((a, b) => a.percentage - b.percentage)
    .slice(0, 12);

  return (
    <AppShell
      title="Analytics"
      subtitle="Current utilisation, workload, teaching patterns and scheduling coverage"
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <RoomUsageChart />
        <LecturerWorkloadChart />
        <PeakHoursChart />
        <ConflictTrendChart />
        <CampusUsageChart />
        <div className="enterprise-card p-5">
          <div className="mb-4">
            <h3 className="font-semibold text-navy">
              Module scheduling coverage
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Scheduled sessions compared with the weekly teaching requirement.
            </p>
          </div>
          <div className="space-y-4">
            {moduleCoverage.map((module) => (
              <div key={module.code}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span
                    className="truncate font-semibold text-navy"
                    title={`${module.code} · ${module.name}`}
                  >
                    {module.code} · {module.name}
                  </span>
                  <span className="shrink-0 text-slate-500">
                    {module.scheduled}/{module.required}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-tealBrand"
                    style={{ width: `${module.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {!moduleCoverage.length && (
            <p className="text-sm text-slate-500">
              No module data is available.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
