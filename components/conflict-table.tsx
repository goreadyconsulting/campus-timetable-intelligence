"use client";
import Link from "next/link";
import { useCampusData } from "./data-context";
export function ConflictTable() {
  const { data } = useCampusData();
  return (
    <div className="enterprise-card p-5">
      <h3 className="font-bold">Current conflicts</h3>
      {data.conflicts.slice(0, 8).map((c) => (
        <p className="border-b py-3 text-sm" key={c.id}>
          {c.type} · {c.module} · {c.time}
        </p>
      ))}
      <Link className="btn-secondary mt-3" href="/conflicts">
        Review conflicts
      </Link>
    </div>
  );
}
