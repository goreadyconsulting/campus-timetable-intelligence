# Backend deployment and workbook migration

The repository contains the complete version 5 service. The configured deployment URL currently redirects anonymous health requests to Google sign-in, so the live shared service has not been verified for this release. GitHub Pages and Apps Script have separate deployment lifecycles.

## Install

1. Open the Apps Script project attached to the existing timetable workbook. Keep the same workbook and deployment; do not create a replacement dataset.
2. Replace `Code.gs` with `apps-script/Code.gs` from this repository.
3. Add a script file named `Domain.gs` and paste the generated `apps-script/Domain.gs` into it. Both files are required. The project must use the V8 runtime.
4. Confirm the `SPREADSHEET_ID` script property, if set, refers to the intended workbook. The checked-in default is `1uxY_vagvXbJR6jNsvV-eFX8e-dUy2pCQW3ilTOMfhY4`.
5. Run `setupBackend` once from the Apps Script editor and authorise the spreadsheet scopes. This administrative action is not exposed as a public HTTP route.
6. Edit the existing web-app deployment and deploy a new version. Execute as the workbook owner and use the access setting that allows the intended users to reach it without a Google login, as required for the no-login frontend.
7. If the deployment URL changes, update `public/runtime-config.json` and push that change.
8. Open `?action=health` without a signed-in Google session. It must return JSON with `ok: true` and `data.version: "5.0.0"`. Then open the app and use Refresh shared data. Editing is enabled only after a valid bootstrap has been read.

## Migration behaviour

Setup appends missing columns and sheets. It does not delete or reorder existing columns, clear tables, overwrite legacy session rows, inflate capacities, infer additional staff campuses or replace PublicationLog history. Existing IDs are retained. New app-created records receive server-generated UUIDs.

Each operational row gains canonical `record_json`, revision and archive fields. During migration the legacy columns remain intact; subsequent application writes update readable mapped columns alongside canonical values. Use the app for normal editing after migration. Editing a legacy spreadsheet cell alone does not update its canonical record or run validation.

The migration is repeatable. If interrupted before completion, it merges remaining legacy records without replacing already converted rows. `SCHEMA_VERSION` is set to 5 only after every migration write completes. Running setup again after completion does not seed over shared data.

Added sheets:

- Campuses, AcademicYears, Terms, TeachingWeeks
- ScheduleSeries, ScheduleVariants
- AvailabilityRules, CampusTravelRules, StudentModuleAllocations, ConflictReviews
- PublicationVersions, PublicationSnapshots
- MutationRequests, MutationJournal

The legacy publication history remains in PublicationLog. Version 5 immutable snapshots begin with the first release made through the new publication screen; old history is not presented as if it contained a reconstructable snapshot.

## Verify live behaviour

- Compare master-record counts and selected capacities/campus permissions with the existing workbook.
- Confirm and adjust the initial academic calendar before generating or publishing teaching.
- Open two independent browser sessions. Create a location in one and refresh the other. Both must show the same permanent ID.
- Start editing the same record in both sessions. Save in one, then save the stale form in the other. The stale save must be rejected and its form retained.
- Move one occurrence, inspect the surrounding weeks, and revert it through Changes.
- Add a dated resource exception and confirm that its affected occurrence reports a real conflict.
- Publish only after checking readiness. Make a later draft change and compare it with the prior immutable version.

If a request is interrupted after preparation, the next service request recovers it from MutationJournal. Do not clear request receipts or journals to retry an uncertain save. Reuse the original request ID.

## Service contracts

GET actions: `health`, `bootstrap`, `getTimetableRange`, `getStudentSchedule`, `getStaffSchedule`, `validateRange`, `publicationSnapshot`, `requestStatus`, `faqs`.

POST actions: `mutate`, `review`, `publish`, `submitSuggestion`, `askGemini`. Mutations require `requestId`, `expectedDataRevision`, and a list of entity operations. Updates and archives also require `id` and `expectedRevision`. All replies use an explicit `ok` flag; failures carry a message and stale-write errors carry `STALE`.

The generated domain bundle can be rebuilt with `npm run build:backend`. CI verifies that the committed bundle matches its TypeScript source.
