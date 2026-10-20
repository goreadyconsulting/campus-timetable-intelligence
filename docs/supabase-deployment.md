# Supabase data service

Project: `agcmyvzfjersvwoqwkkc` (existing project, Seoul region).

The migration imports the current CTI bootstrap without changing IDs, room capacities, staff permissions, teaching weeks, recurrence, variants or revisions. Old voting/quiz data is exported before removal. Source workbook data is retained outside this project for rollback. Never put data exports, private keys or backups in this public repository.

## Access model

CTI currently has shared, no-login access. The read-only `cti_bootstrap` RPC exposes the same working timetable that the existing app exposed. The publishable key identifies the application, not a person, and is safe to include in the frontend. This is **not private or user-specific access**. Institutional/private use requires sign-in and team/campus authorization before loading private records.

All tables use RLS in the non-exposed `cti` schema. Public roles have only the read permissions needed by bootstrap; they cannot write tables, read raw receipts/suggestions/snapshots, or call the commit RPC. The Edge Function checks the application key and origin, validates each edit, and uses its built-in server-side service-role environment variable for the atomic commit. CORS is not user authentication. No service-role key is included in the repository or browser.

`cti_commit` and the receipt/snapshot RPCs use SECURITY INVOKER and are executable only by the service role. A global revision check occurs under a short row lock, so simultaneous writers cannot silently overwrite one another. Failed transaction writes roll back together. Retry receipts and body hashes protect against duplicate saves.

## Deploy and verify

1. Apply the schema using the Supabase migration tool. The canonical schema is `supabase/schema.sql`; the project migration history records the applied changes. Do not re-run CREATE statements against an existing CTI schema.
2. Import the confirmed workbook export using an administrative database session. Preserve every canonical record and revision. Import historical snapshots if the source has published versions.
3. Run `npm run build:supabase` and deploy `supabase/functions/cti-api/bundle.js` as the `cti-api` function's `index.js`. Use `verify_jwt=false`: the function explicitly validates its publishable-key header, because publishable keys are not JWTs.
4. Set the project URL, publishable key and `backendProvider: "supabase"` in `public/runtime-config.json`. A public-key rotation also requires updating `public-config.ts` and redeploying the function.
5. Compare the imported records with the source; test idempotency, stale writers, transaction rollback and anonymous write denial. Then run the unit tests, typecheck and browser harness before publishing the frontend.

First load fetches the complete working scheduling dataset (about 90 KB at migration). This deliberately preserves cross-campus conflict detection and full-range planning/reports. Later loads send a revision check; unchanged data is not downloaded again. Saves return only their changes. This release does not truncate the scheduling dataset to the visible week.

For rollback, pause editing, export any new Supabase changes, reconcile them into the old backend, and only then switch the runtime configuration back. Simply selecting the old workbook after new writes would lose visibility of those changes.
