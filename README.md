# Campus Timetable Intelligence

Campus-aware teaching planning with dated recurrence, scoped changes, shared Supabase persistence and immutable timetable publications.

Application: https://goreadyconsulting.github.io/campus-timetable-intelligence/

## Working locally

Use Node.js 24.

```sh
npm ci
npm run dev
```

The frontend uses `public/runtime-config.json`. Editing requires a confirmed version 5 backend response. A disconnected or older backend leaves the last available data readable and disables editing. Browser storage is a cache and a pending-request register, not a shared source of truth.

## Scheduling

- Academic years, terms and teaching weeks define actual occurrence dates. Non-teaching and archived weeks are excluded.
- Series store campus-local day/time, the campus IANA zone, resource IDs and individual student IDs.
- Variants support one occurrence, selected teaching weeks, a date range, this-and-following, cancellation and extra teaching.
- Precedence is single occurrence, week set, date range, following occurrences, then the base series. Same-priority overlapping overrides are rejected.
- A scoped-change preview shows affected weeks and new conflicts. Draft manual edits can retain conflicts; hard constraints block publication.
- Reverting a variant reveals the next applicable override or base. It does not rewrite history.
- Conflict checks compare UTC instants and cover rooms, staff, individual students, campus permissions, room suitability/capacity, availability, teaching hours and weekly staff workload. Directional travel allowances produce warnings.
- Ambiguous or nonexistent local times during daylight-saving transitions are rejected rather than guessed.

The initial 2026/27 calendar is a configurable starter calendar. Confirm institutional term dates, reading weeks, holidays and exams in Academic Calendar before publication. Legacy repeating sessions are migrated to that calendar; original source sheets remain available for reconciliation.

## Shared writes

Supabase project `agcmyvzfjersvwoqwkkc` stores the timetable. `supabase/schema.sql` defines its tables and transactional RPCs. `supabase/functions/cti-api/index.ts` validates changes using the same TypeScript scheduling domain as the frontend; `npm run build:supabase` generates the deployed bundle.

Writes use per-record revisions, a global data revision, server-generated IDs and stable request IDs. PostgreSQL commits records, audits, publications and the receipt in one transaction. Completed receipts deduplicate retries; different payloads cannot reuse an ID. A successful save returns the changed records, so the client updates its confirmed cache without downloading the full dataset again. Reads do not take the write lock. Cached startup checks the shared revision and reuses the confirmed data when it has not changed.

Public whole-dataset save/reset routes are removed. Master records are archived with dependency checks. Audit entries include before/after values and request IDs. Empty shared arrays remain empty.

Publication follows Draft → In Review → Approved → Published. Review changes advance the shared revision. Data edits invalidate approval. Publication validates its selected year, date range and campuses, checks all overlapping resources including other campuses, and stores an immutable snapshot. Exports from publication history use the saved snapshot.

## Deployment

A push to `main` runs regression tests, checks the generated backend bundle, builds the static export and deploys GitHub Pages. Dependencies are pinned in `package-lock.json`.

**Supabase deployment is separate from GitHub Pages.** Follow [the Supabase deployment instructions](docs/supabase-deployment.md). The Apps Script adapter and [legacy workbook deployment instructions](docs/backend-deployment.md) remain available for rollback; the live frontend selects Supabase in `public/runtime-config.json`.

## Validation

```sh
npm run build:backend
npm test
npm run typecheck
GITHUB_PAGES=true npm run build
```

Tests cover scoped changes, precedence, cancellation/revert, timezone conversion, real clashes, availability, capacity, reference checks, imports, scheduling, stale writers, receipts, migration, interrupted-write recovery and immutable publications.

The browser harness is `tests/browser.mjs`. It serves the built export through Playwright routing, uses an isolated in-memory backend and performs no live writes. It checks desktop/mobile flows, scoped edits/reverts, master creation, failed-form retention, navigation and disconnected controls. Install Playwright and its Chromium browser before running:

```sh
npx playwright install chromium
npm run test:browser
```

`CHROMIUM_EXECUTABLE_PATH` and `PLAYWRIGHT_MODULE` can select an existing test runtime. Browser screenshots are temporary verification output, not application assets.
