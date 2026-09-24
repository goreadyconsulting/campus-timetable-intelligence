"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCampusData } from "@/components/data-context";

export function RoomUsageChart() {
  const { data } = useCampusData();
  const chart = data.rooms
    .map((room) => ({
      name: room.room,
      sessions: data.sessions.filter(
        (session) =>
          session.locationId === room.id && session.status !== "Cancelled",
      ).length,
    }))
    .filter((item) => item.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);

  return (
    <ChartCard title="Most-used rooms">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chart} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} />
          <YAxis
            dataKey="name"
            type="category"
            width={120}
            tick={{ fontSize: 11 }}
          />
          <Tooltip />
          <Bar dataKey="sessions" fill="#14B8A6" radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function LecturerWorkloadChart() {
  const { data } = useCampusData();
  const chart = data.lecturers
    .map((lecturer) => ({
      name: lecturer.name,
      hours: round(
        data.sessions
          .filter(
            (session) =>
              session.staffIds?.includes(lecturer.id!) &&
              session.status !== "Cancelled",
          )
          .reduce(
            (total, session) =>
              total + durationHours(session.start, session.end),
            0,
          ),
      ),
      maximum: lecturer.maxWeeklyHours || 18,
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 10);

  return (
    <ChartCard title="Lecturer workload">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chart} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis
            dataKey="name"
            type="category"
            width={120}
            tick={{ fontSize: 11 }}
          />
          <Tooltip />
          <Bar dataKey="hours" fill="#0F172A" radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ConflictTrendChart() {
  const { data } = useCampusData();
  const types = Array.from(
    new Set(data.conflicts.map((conflict) => conflict.type)),
  );
  const chart = types.map((type) => ({
    type,
    open: data.conflicts.filter(
      (conflict) => conflict.type === type && !conflict.resolved,
    ).length,
    resolved: data.conflicts.filter(
      (conflict) => conflict.type === type && conflict.resolved,
    ).length,
  }));

  return (
    <ChartCard title="Conflict register">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chart} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="type" tick={{ fontSize: 10 }} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar
            dataKey="open"
            stackId="status"
            fill="#EF4444"
            radius={[6, 6, 0, 0]}
          />
          <Bar dataKey="resolved" stackId="status" fill="#14B8A6" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function PeakHoursChart() {
  const { data } = useCampusData();
  const hours = Array.from(
    new Set(data.sessions.map((session) => session.start)),
  ).sort();
  const chart = hours.map((hour) => ({
    hour,
    sessions: data.sessions.filter(
      (session) => session.start === hour && session.status !== "Cancelled",
    ).length,
  }));

  return (
    <ChartCard title="Teaching start times">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chart}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="hour" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="sessions" fill="#F59E0B" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CampusUsageChart() {
  const { data } = useCampusData();
  const campuses = Array.from(new Set(data.rooms.map((room) => room.campus)));
  const chart = campuses
    .map((campus) => ({
      name: campus,
      value: data.sessions.filter(
        (session) =>
          session.campus === campus && session.status !== "Cancelled",
      ).length,
    }))
    .filter((item) => item.value > 0);
  const colours = ["#0F172A", "#14B8A6", "#64748B", "#F59E0B", "#6366F1"];

  return (
    <ChartCard title="Sessions by campus">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={chart}
            dataKey="value"
            nameKey="name"
            outerRadius={88}
            label
          >
            {chart.map((_, index) => (
              <Cell key={index} fill={colours[index % colours.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="enterprise-card p-5">
      <h3 className="mb-4 font-semibold text-navy">{title}</h3>
      {children}
    </div>
  );
}

function durationHours(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return Math.max(
    0,
    (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60,
  );
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
