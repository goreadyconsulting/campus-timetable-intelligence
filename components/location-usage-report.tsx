"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { locationUsage, usageRates, type UsageTotals } from "@/lib/location-usage";
type Result = ReturnType<typeof locationUsage>;
const hours = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
const percent = (value: number | null) => value === null ? "—" : (value * 100).toFixed(1) + "%";
const chartRows = (rows: Result["rows"]) => rows.map(r => {
  const rate = usageRates(r);
  return { name: r.name, Frequency: rate.frequency === null ? null : +(rate.frequency*100).toFixed(1),
    "Planned occupancy": rate.occupancy === null ? null : +(rate.occupancy*100).toFixed(1),
    Utilisation: rate.utilisation === null ? null : +(rate.utilisation*100).toFixed(1) };
});
export function usageExport(rows: Result["rows"]) {
  return rows.map(r => {
    const rate = usageRates(r);
    return { Campus: r.campus, Location: r.name, "Available hours": +r.available.toFixed(2),
      "Booked hours": +r.booked.toFixed(2), "Frequency": percent(rate.frequency),
      "Planned occupancy": percent(rate.occupancy), "Utilisation": percent(rate.utilisation),
      "Occupancy evidence": percent(rate.evidence), "Outside availability hours": +r.outside.toFixed(2),
      "Overlapping hours": +r.overlapping.toFixed(2), "Occupancy quality": rate.evidence === null ? "No bookings" : rate.evidence < 1-1e-8 ? "Partial" : "Complete" };
  });
}
function UsageCards({total}: {total: UsageTotals}) {
  const r = usageRates(total);
  return <div className="grid gap-4 sm:grid-cols-3">
    {[
      {label:"Frequency", value: r.frequency, detail: hours(total.booked) + " of " + hours(total.available) + " room-hours booked"},
      {label:"Planned occupancy", value: r.occupancy, detail: "Planned class size relative to room capacity"},
      {label:"Utilisation", value:r.utilisation, detail: "Frequency × planned occupancy"},
    ].map(k => <section key={k.label} className="enterprise-card p-5">
      <h3 className="text-sm font-semibold text-slate-600">{k.label}</h3>
      <p className="mt-2 text-3xl font-bold tabular-nums text-navy">{percent(k.value)}</p>
      <p className="mt-2 text-xs text-slate-500">{k.detail}</p>
    </section>)}
  </div>;
}
const colours = {Frequency:"#0F766E", "Planned occupancy":"#6483B1", Utilisation:"#BA8128"};
export function LocationUsageReport({result}: {result:Result}) {
  const {total,rows,campuses,months} = result, r = usageRates(total);
  const comparison = chartRows(campuses.length > 1 ? campuses : rows);
  const trend = chartRows(months);
  return <section className="mt-5 space-y-5" aria-label="Location utilisation report">
    <div>
      <h2 className="text-lg font-bold text-navy">Location utilisation</h2>
      <p className="text-sm text-slate-500">Working timetable · physical location records · selected dates and campuses</p>
    </div>
    <UsageCards total={total}/>
    <div className="enterprise-card p-4 text-sm space-y-2">
      <p><strong>{rows.length} locations</strong> · {hours(total.available)} available room-hours · {hours(total.booked)} uniquely booked room-hours</p>
      <p><strong>Occupancy evidence: {percent(r.evidence)}</strong>
        {r.evidence !== null && r.evidence < 1-1e-8 ? " — partial evidence; occupancy and utilisation are provisional estimates." : r.evidence === null ? " — no booked hours." : " — all booked hours have usable evidence."}</p>
      {(total.outside > 0 || total.overlapping > 0 || result.invalidSessions > 0) && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
        {hours(total.outside)} booked hours outside availability · {hours(total.overlapping)} overlapping hours within availability · {result.invalidSessions} invalid-time sessions.
        Outside hours are excluded from the headline metrics; overlapping hours count once for frequency and are excluded from occupancy.
      </p>}
      <p className="text-slate-500">Excluded {result.excludedRooms} online/virtual locations and {result.excludedSessions} sessions without an included physical location. Zero or missing enrolment and capacity do not count as occupancy evidence.</p>
    </div>
    {comparison.length > 0 && <div className="enterprise-card p-5">
      <h3 className="font-semibold">{campuses.length > 1 ? "Comparison by campus" : "Comparison by location"}</h3>
      <p className="mb-4 text-xs text-slate-500">All three measures in percent. Scroll for longer lists.</p>
      <div className="max-h-[650px] overflow-y-auto">
        <ResponsiveContainer width="100%" height={Math.max(220, comparison.length * 76)}>
          <BarChart data={comparison} layout="vertical" margin={{top:5,right:20,bottom:5,left:5}}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
            <XAxis type="number" tickFormatter={v=>v+"%"}/>
            <YAxis type="category" dataKey="name" width={110} tick={{fontSize:11}}/>
            <Tooltip formatter={v => v === null ? "—" : v+"%"}/><Legend/>
            {Object.entries(colours).map(([key,color]) => <Bar key={key} dataKey={key} fill={color} radius={[0,3,3,0]}/>)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>}
    {trend.length > 1 && <div className="enterprise-card p-5">
      <h3 className="mb-4 font-semibold">Monthly utilisation trends</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={trend} margin={{top:5,right:15,bottom:5,left:0}}>
          <CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis tickFormatter={v=>v+"%"}/>
          <Tooltip formatter={v=>v===null?"—":v+"%"}/><Legend/>
          {Object.entries(colours).map(([key,color]) => <Line key={key} dataKey={key} stroke={color} strokeWidth={2} connectNulls={false}/>)}
        </LineChart>
      </ResponsiveContainer>
    </div>}
    <details className="enterprise-card p-4 text-sm text-slate-600">
      <summary className="cursor-pointer font-semibold text-navy">How these measures are calculated</summary>
      <p className="mt-3">Frequency = unique booked hours within available hours ÷ total available room-hours. Idle rooms are included. Availability uses campus opening hours, room-specific weekly windows, dated exceptions and maintenance status, on the selected days.</p>
      <p className="mt-2">Planned occupancy = duration-weighted mean of class size ÷ room capacity for booked hours with valid evidence. Utilisation = frequency × planned occupancy using the same room-hour weighting. Occupancy can exceed 100% if a class exceeds capacity. This is not observed attendance.</p>
      <p className="mt-2">Online locations are inferred from online, virtual or remote labels; combined room configurations are treated as distinct location records until physical components are explicitly modelled. No fabricated capacities or availability are used.</p>
    </details>
  </section>;
}
