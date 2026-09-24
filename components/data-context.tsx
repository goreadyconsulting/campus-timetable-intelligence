"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { initialData } from "@/data/mock";
import type {
  AppData,
  Session,
  Lecturer,
  Room,
  Student,
  Programme,
  Module,
} from "@/types";
import type { EntityName, Mutation } from "@/types/scheduling";
import {
  getRuntimeConfig,
  loadRemoteData,
  requestBackend,
  readBackend,
  type RuntimeConfig,
} from "@/lib/backend";
import { migrateData, resolveOccurrences } from "@/lib/recurrence";
import { detectOccurrenceConflicts } from "@/lib/constraints";
import { campusToday, datePlus, monday } from "@/lib/academic";

export type BackendStatus =
  | "Local"
  | "Connecting"
  | "Connected"
  | "Syncing"
  | "Unavailable";
const CACHE = "cti-confirmed-cache-v5";
function useDataValue() {
  const [rawData, setData] = useState<AppData>(() =>
    migrateData(structuredClone(initialData)),
  );
  const [backendConfig, setConfig] = useState<RuntimeConfig>({
    backendEnabled: false,
    appsScriptUrl: "",
    geminiEnabled: false,
    dataMode: "shared",
  });
  const [backendStatus, setStatus] = useState<BackendStatus>("Connecting");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const [campus, setCampus] = useState("All campuses"),
    [academicYearId, setAcademicYearId] = useState("AY-2026"),
    [weekStart, setWeekStart] = useState(monday(campusToday()));
  const [notice, setNotice] = useState("");
  async function refresh(config = backendConfig) {
    setStatus("Connecting");
    try {
      const next = await loadRemoteData(config);
      setData(next);
      localStorage.setItem(CACHE, JSON.stringify(next));
      setStatus("Connected");
      setError("");
      return next;
    } catch (e) {
      setStatus("Unavailable");
      setError((e as Error).message);
      throw e;
    }
  }
  useEffect(() => {
    let active = true;
    try {
      const cached = localStorage.getItem(CACHE);
      if (cached) {
        const value = JSON.parse(cached);
        if (value.schemaVersion === "5.0.0") setData(value);
      }
    } catch {}
    void getRuntimeConfig().then(async (config) => {
      if (!active) return;
      setConfig(config);
      try {
        await refresh(config);
      } catch {}
    });
    const params = new URLSearchParams(location.search);
    if (params.get("campus")) setCampus(params.get("campus")!);
    if (params.get("year")) setAcademicYearId(params.get("year")!);
    if (/^\d{4}-\d{2}-\d{2}$/.test(params.get("week") || ""))
      setWeekStart(monday(params.get("week")!));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("campus", campus);
    url.searchParams.set("year", academicYearId);
    url.searchParams.set("week", weekStart);
    history.replaceState(null, "", url);
  }, [campus, academicYearId, weekStart]);
  const derived = useMemo(() => {
    try {
      const all = resolveOccurrences(
        rawData,
        datePlus(weekStart, -1),
        datePlus(weekStart, 7),
      );
      const sessions = all.filter(
        (s) =>
          s.date! >= weekStart &&
          s.date! <= datePlus(weekStart, 6) &&
          s.academicYearId === academicYearId &&
          (campus === "All campuses" || s.campus === campus),
      );
      const ids = new Set(sessions.map((s) => s.id));
      return {
        data: {
          ...rawData,
          sessions,
          conflicts: detectOccurrenceConflicts(rawData, all).filter((c) =>
            c.occurrenceIds?.some((id) => ids.has(id)),
          ),
        },
        resolutionError: "",
      };
    } catch (e) {
      return {
        data: { ...rawData, sessions: [], conflicts: [] },
        resolutionError: (e as Error).message,
      };
    }
  }, [rawData, weekStart, campus, academicYearId]);
  async function run(body: Record<string, unknown>) {
    if (busy.current) throw new Error("A save is already in progress.");
    if (backendStatus !== "Connected")
      throw new Error("Reconnect to shared data before saving.");
    busy.current = true;
    setStatus("Syncing");
    try {
      const result = await requestBackend(backendConfig, body);
      try {
        await refresh();
        setNotice("Saved to shared data.");
      } catch {
        setNotice(
          "Your change was saved. Reconnect to display the latest data.",
        );
      }
      return result;
    } catch (e) {
      setError((e as Error).message);
      setStatus("Unavailable");
      throw e;
    } finally {
      busy.current = false;
    }
  }
  const mutate = (mutations: Mutation[]) =>
    run({
      action: "mutate",
      expectedDataRevision: rawData.dataRevision,
      mutations,
    });
  const save = (entity: EntityName, record: any, reason = "") => {
    const existing = ((rawData[entity] || []) as any[]).find(
      (r) => r.id === record.id,
    );
    return mutate([
      {
        entity,
        operation: existing ? "update" : "create",
        id: existing?.id,
        expectedRevision: record.revision ?? existing?.revision,
        record,
        reason,
      },
    ]);
  };
  const archive = (entity: EntityName, id: string) => {
    const r = ((rawData[entity] || []) as any[]).find((r) => r.id === id);
    return mutate([
      {
        entity,
        id,
        operation:
          entity === "variants" || entity === "exceptions"
            ? "delete"
            : "archive",
        expectedRevision: r?.revision,
        reason: "Archived from application",
      },
    ]);
  };
  return {
    rawData,
    data: derived.data,
    resolutionError: derived.resolutionError,
    backendConfig,
    backendStatus,
    error,
    notice,
    setNotice,
    canWrite: backendStatus === "Connected",
    campus,
    setCampus,
    academicYearId,
    setAcademicYearId,
    weekStart,
    setWeekStart,
    refresh,
    syncNow: () => refresh(),
    mutate,
    save,
    archive,
    run,
    read: (action: string, p: Record<string, string> = {}) =>
      readBackend(backendConfig, action, p),
  };
}
const Context = createContext<ReturnType<typeof useDataValue> | null>(null);
export function DataProvider({ children }: { children: React.ReactNode }) {
  return <Context.Provider value={useDataValue()}>{children}</Context.Provider>;
}
export function useCampusData() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing DataProvider");
  return value;
}
