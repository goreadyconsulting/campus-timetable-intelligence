import { planRequest } from "../../../lib/supabase-service";
import {
  resolveOccurrences,
  detectOccurrenceConflicts,
} from "../../../lib/domain";
import { validDate, datePlus } from "../../../lib/academic";
import { publishableKey } from "./public-config";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

const origin = "https://goreadyconsulting.github.io";
const headers = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "access-control-allow-origin": origin,
  "access-control-allow-headers": "apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  vary: "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
async function rpc(name: string, body: unknown) {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const response = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) {
    console.error("CTI database request failed", name, response.status);
    throw new Error("Shared data could not be reached. Please retry.");
  }
  return response.json();
}
Deno.serve(async (req) => {
  if (req.headers.get("origin") && req.headers.get("origin") !== origin)
    return json(
      { ok: false, error: { message: "This origin is not allowed." } },
      403,
    );
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  // CTI retains its existing shared, no-login access model. This public key
  // identifies the app; it is not a user credential or a substitute for login.
  // Raw tables and commit functions are inaccessible with this key.
  if (req.headers.get("apikey") !== publishableKey)
    return json(
      { ok: false, error: { message: "A valid application key is required." } },
      401,
    );
  try {
    const url = new URL(req.url);
    if (req.method === "GET") {
      const action = url.searchParams.get("action") || "health";
      let data: any;
      if (action === "requestStatus")
        data = await rpc("cti_receipt", {
          p_request_id: url.searchParams.get("requestId"),
        });
      else if (action === "publicationSnapshot") {
        data = await rpc("cti_snapshot", { p_id: url.searchParams.get("id") });
        if (!data) throw new Error("Publication not found.");
      } else if (action === "bootstrap" || action === "health") {
        const revision = Number(url.searchParams.get("revision"));
        data = await rpc("cti_bootstrap", {
          p_revision:
            Number.isSafeInteger(revision) && revision > 0 ? revision : null,
        });
        if (action === "health")
          data = { version: "5.0.0", dataRevision: data.dataRevision };
      } else if (action === "faqs") data = [];
      else if (
        [
          "getTimetableRange",
          "getStudentSchedule",
          "getStaffSchedule",
          "validateRange",
        ].includes(action)
      ) {
        const start = url.searchParams.get("startDate") || "",
          end = url.searchParams.get("endDate") || "";
        if (
          !validDate(start) ||
          !validDate(end) ||
          start > end ||
          end > datePlus(start, 370)
        )
          throw new Error("Invalid date range.");
        const allData = await rpc("cti_bootstrap", {});
        const all = resolveOccurrences(allData, start, end);
        const sessions = all.filter(
          (s) =>
            (!url.searchParams.get("campusId") ||
              s.campusId === url.searchParams.get("campusId")) &&
            (!url.searchParams.get("studentId") ||
              s.studentIds?.includes(url.searchParams.get("studentId")!)) &&
            (!url.searchParams.get("staffId") ||
              s.staffIds?.includes(url.searchParams.get("staffId")!)),
        );
        data =
          action === "validateRange"
            ? detectOccurrenceConflicts(allData, all).filter((c) =>
                c.occurrenceIds?.some((id) =>
                  sessions.some((s) => s.id === id),
                ),
              )
            : sessions;
      } else throw new Error("This action is not supported.");
      return json({ ok: true, data });
    }
    if (req.method !== "POST")
      return json(
        { ok: false, error: { message: "Method not allowed." } },
        405,
      );
    const text = await req.text();
    if (text.length > 2000000)
      return json(
        { ok: false, error: { message: "This request is too large." } },
        413,
      );
    const body = JSON.parse(text);
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId || ""))
      throw new Error("A unique request ID is required.");
    const hash = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(body)),
        ),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const data = await rpc("cti_bootstrap", {});
    let plan;
    try {
      plan = planRequest(
        data,
        body,
        () => crypto.randomUUID(),
        new Date().toISOString(),
      );
    } catch (error) {
      const message = (error as Error).message;
      plan = {
        response: {
          ok: false,
          requestId: body.requestId,
          error: {
            code: message.startsWith("STALE:") ? "STALE" : "INVALID",
            message,
          },
        },
      };
    }
    return json(
      await rpc("cti_commit", {
        p_request_id: body.requestId,
        p_hash: hash,
        p_expected: data.dataRevision,
        p_plan: plan,
      }),
    );
  } catch (error) {
    return json({ ok: false, error: { message: (error as Error).message } });
  }
});
