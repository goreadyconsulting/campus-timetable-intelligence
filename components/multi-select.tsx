"use client";

import { useId, useState } from "react";

type Option = { id: string; name: string };

export function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  // Keep existing selections visible even if a record has since been archived.
  const choices = [
    ...options,
    ...value
      .filter((v) => !options.some((o) => o.id === v))
      .map((v) => ({ id: v, name: `${v} (no longer available)` })),
  ];
  const matches = choices.filter((o) =>
    `${o.name} ${o.id}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selected = choices.filter((o) => value.includes(o.id));

  return (
    <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-700">
        {label}
      </legend>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span aria-live="polite" className="text-slate-500">
          {value.length} selected
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            className="min-h-8 font-semibold text-teal-700"
            disabled={!matches.length}
            onClick={() =>
              onChange([...new Set([...value, ...matches.map((o) => o.id)])])
            }
          >
            {query ? `Select ${matches.length} matches` : "Select all"}
          </button>
          <button
            type="button"
            className="min-h-8 font-semibold text-slate-600"
            disabled={!value.length}
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
      </div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {selected.slice(0, 3).map((o) => (
            <button
              key={o.id}
              type="button"
              aria-label={`Remove ${o.name}`}
              className="max-w-full truncate rounded-lg bg-teal-50 px-2 py-1.5 text-xs text-teal-900"
              onClick={() => onChange(value.filter((v) => v !== o.id))}
            >
              {o.name} ×
            </button>
          ))}
          {selected.length > 3 && (
            <span className="p-1 text-xs text-slate-500">
              +{selected.length - 3} more
            </span>
          )}
        </div>
      )}
      <label className="sr-only" htmlFor={id}>
        Search {label.toLowerCase()}
      </label>
      <input
        id={id}
        type="search"
        className="input mb-2 w-full"
        placeholder="Type to find…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-40 overflow-y-auto overscroll-contain">
        {matches.slice(0, 80).map((o) => (
          <label
            key={o.id}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-slate-50"
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-teal-600"
              checked={value.includes(o.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, o.id]
                    : value.filter((v) => v !== o.id),
                )
              }
            />
            <span className="min-w-0 break-words">{o.name}</span>
          </label>
        ))}
        {!matches.length && (
          <p className="px-2 py-4 text-sm text-slate-500">
            {choices.length
              ? "No matches. Try a different search."
              : "No options available for this selection."}
          </p>
        )}
        {matches.length > 80 && (
          <p className="p-2 text-xs text-slate-500">
            Showing 80 of {matches.length}. Keep typing to narrow the list.
          </p>
        )}
      </div>
    </fieldset>
  );
}
