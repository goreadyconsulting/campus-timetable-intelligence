export function KpiCard({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: string;
}) {
  return (
    <div className="enterprise-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="badge bg-slate-100 text-slate-600">{change}</span>
      </div>
      <h3 className="mt-4 text-3xl font-bold text-navy">{value}</h3>
    </div>
  );
}
