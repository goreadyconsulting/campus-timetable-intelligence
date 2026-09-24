import { cn } from "@/lib/utils";

const toneMap: Record<string, string> = {
  Available: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  Occupied: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Maintenance: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Normal: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  High: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Overloaded: "bg-red-50 text-red-700 ring-1 ring-red-200",
  Critical: "bg-red-50 text-red-700 ring-1 ring-red-200",
  Medium: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Low: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
};

export function StatusBadge({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "badge",
        toneMap[value] || "bg-slate-100 text-slate-700",
        className,
      )}
    >
      {value}
    </span>
  );
}
