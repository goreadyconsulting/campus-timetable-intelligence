"use client";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useCampusData } from "@/components/data-context";
import { Field, FormError } from "@/components/modal";
import { entityLabels } from "@/components/record-editor";
import { parseCsv } from "@/lib/csv";
import { importFields, previewImport } from "@/lib/import";
import { downloadCsv } from "@/lib/export";
import type { EntityName } from "@/types/scheduling";
export default function Import() {
  const c = useCampusData();
  const [entity, setEntity] = useState<EntityName>("rooms"),
    [rows, setRows] = useState<Record<string, string>[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const fields = importFields[entity] || [],
    columns = Object.keys(rows[0] || {});
  const preview = useMemo(
      () => previewImport(c.rawData, entity, rows, mapping),
      [c.rawData, entity, rows, mapping],
    ),
    invalid = preview.filter((r) => r.error).length;
  return (
    <AppShell
      title="Data Import"
      subtitle="Map columns, validate references and preview additions"
    >
      <div className="enterprise-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Record type">
            <select
              className="input"
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value as EntityName);
                setRows([]);
                setMapping({});
              }}
            >
              {Object.keys(importFields).map((e) => (
                <option key={e} value={e}>
                  {entityLabels[e as EntityName]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="CSV file">
            <input
              type="file"
              accept=".csv,text/csv"
              className="input py-2"
              onChange={async (e) => {
                setError("");
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 2_000_000)
                    throw new Error("Choose a CSV smaller than 2 MB.");
                  const parsed = parseCsv(await file.text());
                  if (!parsed.length || parsed.length > 300)
                    throw new Error(
                      "Import between 1 and 300 records per file.",
                    );
                  setRows(parsed);
                  const keys = Object.keys(parsed[0]);
                  const clean = (s: string) =>
                    s.replace(/_/g, "").toLowerCase();
                  setMapping(
                    Object.fromEntries(
                      fields.map((f) => [
                        f,
                        keys.find((k) => clean(k) === clean(f)) || "",
                      ]),
                    ),
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          </Field>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          New records receive permanent IDs. References such as programmeId,
          moduleId and resourceId must match existing records. Separate multiple
          values with |. Existing records are retained.
        </p>
        <button
          className="btn-secondary mt-3"
          onClick={() =>
            downloadCsv(`${entity}-columns.csv`, [
              Object.fromEntries(fields.map((f) => [f, ""])),
            ])
          }
        >
          Download column template
        </button>
        {rows.length > 0 && (
          <>
            <h2 className="mb-3 mt-6 font-bold">Map file columns</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {fields.map((f) => (
                <Field key={f} label={f.replace(/([A-Z])/g, " $1")}>
                  <select
                    className="input"
                    value={mapping[f] || ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [f]: e.target.value }))
                    }
                  >
                    <option value="">No column</option>
                    {columns.map((col) => (
                      <option key={col}>{col}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="badge bg-slate-100">
                {preview.length} rows · {invalid} invalid
              </span>
              <button
                className="btn-primary"
                disabled={busy || !c.canWrite || invalid > 0}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await c.mutate(
                      preview.map((r) => ({
                        entity,
                        operation: "create",
                        record: { ...r.record, id: undefined },
                        reason: "CSV import",
                      })),
                    );
                    setRows([]);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Importing…" : `Import ${preview.length} records`}
              </button>
            </div>
          </>
        )}
        <FormError message={error} />
      </div>
      {preview.length > 0 && (
        <div className="enterprise-card mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>CSV row</th>
                <th>Record</th>
                <th>Validation</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p) => (
                <tr key={p.row}>
                  <td>{p.row}</td>
                  <td>
                    {p.record.name || p.record.room || p.record.resourceId}
                  </td>
                  <td className={p.error ? "text-red-700" : "text-emerald-700"}>
                    {p.error || "Ready to add"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
