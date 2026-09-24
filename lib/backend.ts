import type { AppData } from "@/types";
import type {
  ActivityTemplate,
  AvailabilityException,
  PublicationState,
  SuggestionInput,
} from "@/types/workflow";

export type RuntimeConfig = {
  backendEnabled: boolean;
  appsScriptUrl: string;
  geminiEnabled: boolean;
  dataMode: "training" | "live" | "shared" | string;
};

export type SaveResult = "confirmed";

export type WorkflowPayload = {
  templates: ActivityTemplate[];
  exceptions: AvailabilityException[];
  publication: PublicationState;
};

const defaultConfig: RuntimeConfig = {
  backendEnabled: false,
  appsScriptUrl: "",
  geminiEnabled: false,
  dataMode: "training",
};

const READ_TIMEOUT_MS = 60000;
const WRITE_TIMEOUT_MS = 60000;

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (typeof window === "undefined") return defaultConfig;
  try {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const response = await fetch(
      `${basePath}/runtime-config.json?ts=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!response.ok) return defaultConfig;
    const config = await response.json();
    return { ...defaultConfig, ...config };
  } catch {
    return defaultConfig;
  }
}

export async function readBackend(
  config: RuntimeConfig,
  action: string,
  parameters: Record<string, string> = {},
) {
  if (!config.backendEnabled || !config.appsScriptUrl)
    throw new Error("The shared service is not connected.");
  const p = await getJsonWithJsonpFallback(
    buildUrl(config.appsScriptUrl, {
      action,
      ...parameters,
      ts: String(Date.now()),
    }),
  );
  if (!p?.ok)
    throw new Error(
      p?.error?.message || p?.error || "Unable to read shared data.",
    );
  return p.data;
}
export async function loadRemoteData(config: RuntimeConfig): Promise<AppData> {
  const data = await readBackend(config, "bootstrap");
  if (
    data?.schemaVersion !== "5.0.0" ||
    !Array.isArray(data.series) ||
    !Number.isInteger(data.dataRevision)
  )
    throw new Error(
      "The shared service needs the current schema before editing is available.",
    );
  return data;
}
export async function checkBackendReachable(config: RuntimeConfig) {
  try {
    const d = await readBackend(config, "health");
    return d.version === "5.0.0";
  } catch {
    return false;
  }
}
const PENDING = "cti-pending-requests-v5";
export async function requestBackend(
  config: RuntimeConfig,
  body: Record<string, unknown>,
) {
  if (!config.backendEnabled || !config.appsScriptUrl)
    throw new Error("The shared service is not connected.");
  const { expectedDataRevision: _revision, ...identity } = body;
  const fingerprint = JSON.stringify({
    url: config.appsScriptUrl,
    ...identity,
  });
  let pending: Record<
    string,
    { requestId: string; body: Record<string, unknown> }
  > = JSON.parse(localStorage.getItem(PENDING) || "{}");
  // Persist the request before sending. An unconfirmed retry uses the same ID, including after refresh.
  for (const [key, old] of Object.entries(pending)) {
    if (key === fingerprint) continue;
    let receipt;
    try {
      receipt = await readBackend(config, "requestStatus", {
        requestId: old.requestId,
      });
    } catch {
      throw new Error(
        "An earlier save is still unconfirmed. Reconnect before submitting another change.",
      );
    }
    if (!receipt || receipt.pending)
      throw new Error(
        "An earlier save is still unconfirmed. Retry the original change before submitting another one.",
      );
    delete pending[key];
    localStorage.setItem(PENDING, JSON.stringify(pending));
    if (receipt.ok)
      throw new Error(
        "An earlier change was saved. Refresh shared data and review it before submitting this different change.",
      );
  }
  const entry = pending[fingerprint] || {
    requestId: crypto.randomUUID(),
    body,
  };
  pending[fingerprint] = entry;
  localStorage.setItem(PENDING, JSON.stringify(pending));
  const finish = (result: any) => {
    if (result?.pending)
      throw new Error(
        "Save confirmation is pending. Refresh or retry to check the same request.",
      );
    if (result) {
      pending = JSON.parse(localStorage.getItem(PENDING) || "{}");
      delete pending[fingerprint];
      localStorage.setItem(PENDING, JSON.stringify(pending));
    }
    if (!result?.ok)
      throw new Error(
        result?.error?.message || result?.error || "Save was not confirmed.",
      );
    return result;
  };
  let prior;
  try {
    prior = await readBackend(config, "requestStatus", {
      requestId: entry.requestId,
    });
  } catch {}
  if (prior) return finish(prior);
  let result;
  try {
    result = await postReadable(config.appsScriptUrl, {
      ...entry.body,
      requestId: entry.requestId,
    });
  } catch (error) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const receipt = await readBackend(config, "requestStatus", {
          requestId: entry.requestId,
        });
        if (receipt) return finish(receipt);
      } catch {}
      await new Promise((r) => setTimeout(r, 800));
    }
    throw new Error(
      "Save confirmation is unavailable. Your request is retained; reconnect and retry to check its result.",
    );
  }
  return finish(result);
}
export async function submitSuggestion(
  config: RuntimeConfig,
  suggestion: SuggestionInput,
) {
  return (
    await requestBackend(config, { action: "submitSuggestion", suggestion })
  ).data as { suggestionId: string; submittedAt: string };
}
export async function askGemini(
  config: RuntimeConfig,
  question: string,
  data: AppData,
) {
  if (!config.geminiEnabled) return null;
  const result = await requestBackend(config, {
    action: "askGemini",
    question,
    context: {
      campuses: data.campuses,
      sessions: data.sessions,
      conflicts: data.conflicts,
      templates: data.templates,
    },
  });
  return result.answer || null;
}
async function getJsonWithJsonpFallback(url: string) {
  // Apps Script ContentService responses are cross-origin and redirect through
  // script.googleusercontent.com. In the browser, JSONP is the reliable read
  // transport and avoids waiting for a fetch/CORS failure before retrying.
  if (typeof window !== "undefined" && isAppsScriptWebApp(url)) {
    return jsonp(url);
  }
  try {
    return await getReadableJson(url);
  } catch (error) {
    if (typeof window === "undefined") throw error;
    return jsonp(url);
  }
}

function isAppsScriptWebApp(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "script.google.com" &&
      parsed.pathname.startsWith("/macros/s/")
    );
  } catch {
    return false;
  }
}

async function getReadableJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Backend load failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function postReadable(url: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Backend request failed: ${response.status}`);
    const payload = await response.json();

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function jsonp(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const callbackName = `__ctiJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const target = new URL(url);
    target.searchParams.set("callback", callbackName);
    const script = document.createElement("script");
    const timer = window.setTimeout(
      () => cleanup(new Error("Backend JSONP request timed out")),
      READ_TIMEOUT_MS,
    );

    function cleanup(error?: Error, payload?: unknown) {
      window.clearTimeout(timer);
      script.remove();
      delete (window as unknown as Record<string, unknown>)[callbackName];
      if (error) reject(error);
      else resolve(payload);
    }

    (window as unknown as Record<string, unknown>)[callbackName] = (
      payload: unknown,
    ) => cleanup(undefined, payload);
    script.onerror = () => cleanup(new Error("Backend JSONP request failed"));
    script.src = target.toString();
    document.head.appendChild(script);
  });
}

function buildUrl(baseUrl: string, parameters: Record<string, string>) {
  const url = new URL(baseUrl);
  Object.entries(parameters).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return url.toString();
}

function createClientReference() {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
  return `SUG-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
