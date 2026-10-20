const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import { fixture } from "./fixture.ts";
import { applyMutations } from "../lib/domain.ts";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
async function serve(context) {
  await context.route("http://127.0.0.1:8765/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/runtime-config.json")) return route.fallback();
    let file = url.pathname.replace("/campus-timetable-intelligence", "");
    if (file.endsWith("/")) file += "index.html";
    try {
      const body = await readFile(path.join(process.cwd(), "out", file));
      const ext = path.extname(file);
      await route.fulfill({
        body,
        contentType:
          ext === ".html"
            ? "text/html"
            : ext === ".js"
              ? "application/javascript"
              : ext === ".css"
                ? "text/css"
                : ext === ".json"
                  ? "application/json"
                  : "text/plain",
      });
    } catch {
      await route.fulfill({ status: 404, body: "Not found" });
    }
  });
}

await mkdir(".cache", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  args: ["--no-sandbox"],
});
let data = fixture();
const receipts = new Map();
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Los_Angeles",
});
await serve(context);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
await context.route("**/runtime-config.json*", (r) =>
  r.fulfill({
    json: {
      backendEnabled: true,
      appsScriptUrl: "https://backend.test/exec",
      geminiEnabled: false,
      dataMode: "shared",
    },
  }),
);
await context.route("https://backend.test/**", async (r) => {
  const url = new URL(r.request().url());
  if (r.request().method() === "GET") {
    const action = url.searchParams.get("action");
    return r.fulfill({
      json: {
        ok: true,
        data:
          action === "requestStatus"
            ? receipts.get(url.searchParams.get("requestId")) || null
            : data,
      },
    });
  }
  const body = JSON.parse(r.request().postData());
  let result;
  try {
    const next = applyMutations(
      data,
      body.mutations,
      body.expectedDataRevision,
      body.requestId,
      randomUUID,
      new Date().toISOString(),
    );
    data = next.data;
    result = { ok: true, data: { ids: next.ids }, revision: data.dataRevision };
  } catch (e) {
    result = { ok: false, error: { message: e.message } };
  }
  receipts.set(body.requestId, result);
  return r.fulfill({ json: result });
});
const base = "http://127.0.0.1:8765/campus-timetable-intelligence";
await page.goto(base + "/timetable/?week=2026-10-26");
await page.getByText("Shared data connected", { exact: true }).waitFor();
// Visible filters compose, and empty states offer a direct recovery.
await page.getByLabel("Lecturer", { exact: true }).selectOption("L2");
await page
  .getByRole("heading", { name: "No classes match these filters" })
  .waitFor();
await page.getByRole("button", { name: "Clear filters", exact: true }).click();
await page.getByLabel("Campus", { exact: true }).selectOption("Birmingham");
await page.getByLabel("Lecturer", { exact: true }).selectOption("L1");
await page.getByLabel("Course", { exact: true }).selectOption("P1");
await page.getByLabel("Room", { exact: true }).selectOption("R1");
await page.getByRole("button", { name: /09:00-11:00/ }).waitFor();
await page.getByRole("button", { name: "Calendar", exact: true }).click();
await page
  .getByRole("region", { name: "Weekly calendar", exact: true })
  .waitFor();
// View, campus and filters survive reopening the timetable without scope parameters.
await page.goto(base + "/timetable/?week=2026-10-26");
await page.getByText("Shared data connected", { exact: true }).waitFor();
assert.equal(
  await page
    .getByRole("button", { name: "Calendar", exact: true })
    .getAttribute("aria-pressed"),
  "true",
);
assert.equal(
  await page.getByLabel("Campus", { exact: true }).inputValue(),
  "Birmingham",
);
assert.equal(
  await page.getByLabel("Lecturer", { exact: true }).inputValue(),
  "L1",
);
assert.equal(
  await page.getByLabel("Course", { exact: true }).inputValue(),
  "P1",
);
assert.equal(await page.getByLabel("Room", { exact: true }).inputValue(), "R1");
await page.getByRole("button", { name: /09:00-11:00/ }).waitFor();
await page.getByRole("button", { name: "Clear filters", exact: true }).click();
await page.getByRole("button", { name: "List", exact: true }).click();
await page.getByRole("button", { name: /09:00-11:00/ }).click();
await page
  .getByRole("dialog", { name: "Class details", exact: true })
  .waitFor();
await page.screenshot({ path: ".cache/cti-class-panel.png" });
await page.getByRole("button", { name: "Move class", exact: true }).click();
await page.getByLabel("Start", { exact: true }).fill("13:00");
await page.getByLabel("End", { exact: true }).fill("15:00");
await page.getByLabel("Reason", { exact: true }).fill("Week six move");
await page
  .getByRole("dialog")
  .screenshot({ path: ".cache/cti-move-panel.png" });
await page.getByRole("button", { name: "Also change other details" }).click();
// People selections survive searching and can be toggled without modifier keys.
await page.getByLabel("Search staff", { exact: true }).fill("Blair");
await page.getByRole("checkbox", { name: "Blair", exact: true }).check();
await page.getByLabel("Search staff", { exact: true }).fill("");
assert(
  await page.getByRole("checkbox", { name: "Alex", exact: true }).isChecked(),
);
await page.getByRole("checkbox", { name: "Blair", exact: true }).uncheck();
await page.getByLabel("Reason", { exact: true }).fill("Week six move");
await page
  .getByRole("region", { name: "Change summary" })
  .getByText("1 class affected", { exact: true })
  .waitFor();
await page
  .getByRole("dialog")
  .screenshot({ path: ".cache/cti-change-review.png" });
await page.getByRole("button", { name: "Save class change" }).click();
await page
  .getByRole("dialog", { name: "Class details", exact: true })
  .waitFor();
assert.equal(data.variants.length, 1);
assert.equal(data.variants[0].scope, "single_occurrence");
// A focused room edit updates the existing change and retains its edited time.
await page.getByRole("button", { name: "Change room", exact: true }).click();
assert.equal(await page.getByLabel("Start", { exact: true }).count(), 0);
await page.getByLabel("Location", { exact: true }).selectOption("R2");
await page.getByRole("button", { name: "Save class change" }).click();
await page
  .getByRole("dialog", { name: "Class details", exact: true })
  .waitFor();
assert.equal(data.variants.length, 1);
assert.equal(data.variants[0].patch.startLocalTime, "13:00");
assert.equal(data.variants[0].patch.locationId, "R2");
await page.getByRole("button", { name: "Close dialog", exact: true }).click();
await page.screenshot({
  path: ".cache/cti-timetable-desktop.png",
  fullPage: true,
});
// The class form retains the existing model while making teaching weeks selectable.
await page.getByRole("button", { name: "Add class", exact: true }).click();
await page.getByRole("dialog", { name: "Add class" }).waitFor();
await page.getByLabel("Module", { exact: true }).selectOption("M1");
await page.getByLabel("Day", { exact: true }).selectOption("2");
await page.getByLabel("Location", { exact: true }).selectOption("R2");
await page.getByRole("checkbox", { name: "Blair", exact: true }).check();
await page
  .getByRole("checkbox", { name: "Student One · U1", exact: true })
  .check();
await page
  .getByRole("checkbox", { name: "Week 6 · 2026-10-26", exact: true })
  .check();
await page
  .getByRole("dialog")
  .screenshot({ path: ".cache/cti-class-form.png" });
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Add class", exact: true })
  .click();
await page.getByRole("dialog").waitFor({ state: "hidden" });
assert(
  data.series.some(
    (s) =>
      s.staffIds.includes("L2") &&
      s.dayOfWeek === 2 &&
      s.teachingWeeks.length === 1 &&
      s.teachingWeeks[0] === 6,
  ),
);
await page.getByRole("button", { name: /13:00-15:00/ }).click();
await page.getByRole("button", { name: "Revert change", exact: true }).click();
await page
  .getByRole("region", { name: "Change summary" })
  .getByText("After reverting", { exact: true })
  .waitFor();
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Revert change", exact: true })
  .click();
await page
  .getByRole("dialog", { name: "Class details", exact: true })
  .waitFor();
assert.equal(data.variants[0].archived, true);
// Cancelling does not strand the user: the panel keeps the class and its revert action.
await page.getByRole("button", { name: "Cancel class", exact: true }).click();
await page.getByLabel("Reason", { exact: true }).fill("Tutor unavailable");
await page
  .getByRole("region", { name: "Change summary" })
  .getByText("Cancelled", { exact: true })
  .waitFor();
await page.getByRole("button", { name: "Save class change" }).click();
await page
  .getByRole("dialog", { name: "Class details", exact: true })
  .waitFor();
await page.getByRole("button", { name: "Revert change", exact: true }).click();
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Revert change", exact: true })
  .click();
await page
  .getByRole("dialog", { name: "Class details", exact: true })
  .waitFor();
assert(data.variants.every((v) => v.archived));
await page.getByRole("button", { name: "Close dialog", exact: true }).click();
await page.goto(base + "/rooms/");
await page.getByText("Shared data connected", { exact: true }).waitFor();
await page.getByRole("button", { name: "Add location", exact: true }).click();
await page
  .getByLabel("Location name", { exact: true })
  .fill("Browser test location");
await page.getByLabel("Building", { exact: true }).fill("Building One");
await page.getByRole("button", { name: "Save changes", exact: true }).click();
await page.getByRole("dialog").waitFor({ state: "hidden" });
assert(data.rooms.some((r) => r.room === "Browser test location"));
await page.getByRole("button", { name: "Add location", exact: true }).click();
await page
  .getByLabel("Location name", { exact: true })
  .fill("Browser test location");
await page.getByLabel("Building", { exact: true }).fill("Building One");
await page.getByRole("button", { name: "Save changes", exact: true }).click();
await page.getByRole("dialog").getByRole("alert").waitFor();
assert(await page.getByRole("dialog").isVisible());
await page.keyboard.press("Escape");
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + "/timetable/?week=2026-10-26");
await page.getByText("Shared data connected", { exact: true }).waitFor();
await page.getByRole("button", { name: "Calendar", exact: true }).click();
await page
  .getByRole("region", { name: "Weekly calendar", exact: true })
  .waitFor();
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
  "Mobile calendar overflow",
);
await page.screenshot({
  path: ".cache/cti-calendar-mobile.png",
  fullPage: true,
});
await page.getByRole("button", { name: "List", exact: true }).click();
assert(await page.getByLabel("Lecturer", { exact: true }).isHidden());
await page.getByRole("button", { name: "Filters", exact: true }).click();
await page.getByLabel("Lecturer", { exact: true }).selectOption("L2");
await page.getByRole("button", { name: "Filters (1)", exact: true }).click();
assert(await page.getByLabel("Lecturer", { exact: true }).isHidden());
await page.getByText("1 of 2 classes shown · Filters applied").waitFor();
await page.getByRole("button", { name: "Clear filters", exact: true }).click();
await page.screenshot({
  path: ".cache/cti-timetable-mobile.png",
  fullPage: true,
});
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
  "Mobile overflow",
);
await page.getByRole("button", { name: "Menu", exact: true }).click();
await page
  .getByRole("dialog")
  .getByRole("link", { name: "Academic Calendar", exact: true })
  .waitFor();
await page.keyboard.press("Escape");
assert.equal(await page.getByRole("dialog").count(), 0);
for (const route of [
  "calendar",
  "changes",
  "availability",
  "planning",
  "publication",
  "reports",
  "students",
  "programmes",
  "analytics",
  "import",
  "settings",
  "dashboard",
  "suggestions",
  "conflicts",
]) {
  await page.goto(`${base}/${route}/`);
  await page.getByText("Shared data connected", { exact: true }).waitFor();
  assert(
    !(await page.locator("body").innerText()).includes("Application error"),
    route,
  );
}
const offline = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
await offline.route("**/runtime-config.json*", (r) =>
  r.fulfill({ json: { backendEnabled: false } }),
);
await serve(offline);
const off = await offline.newPage();
await off.goto(base + "/rooms/");
await off.locator("header").getByText("Read only", { exact: true }).waitFor();
assert(
  await off
    .getByRole("button", { name: "Add location", exact: true })
    .isDisabled(),
);
assert.equal(errors.length, 0, errors.join("\n"));
console.log(
  "Browser flows passed: remembered campus/filters/view, mobile calendar, class panel, focused edits, impact review, cancellation and direct revert, class creation, failed form retention, navigation and offline controls.",
);
await browser.close();
