# Marketing Stage 2: /event-details

- **Role:** coder (primary agent; no specialists spawned)
- **Date:** 2026-11-19, America/New_York

## Goal

`/event-details` with the core and extras modals, an atomic merge of
submissions and an ephemeral confirmation. No summary card or reminders.

## Changes

- `server/marketing/details-form.js`: core form (title, date & time, location,
  description, food) and extras form (assets, collab, tagging, notes), with the
  ported bot's labels and lengths; prefill clipped to each max; reading accepts
  only the form's own inputs, trims, drops blanks, rejects over-long values.
- `server/marketing/event-details.js`: command (optional `extras` switch) →
  deferred private picker; pick → modal as the direct response, prefill read
  limited to 2 s; submit → deferred private reply, merge, confirmation embed
  with "Still missing". Access checked on all three steps.
- `server/marketing/{commands,interactions,store,views}.js`: command
  definition, dispatcher wiring, `merge` RPC, picker custom ID parameter.
- `supabase/migrations/202611190058_marketing_event_details_merge.sql`:
  service-only `marketing_event_merge`, single `insert ... on conflict` with
  `details || excluded.details`, version bump, `too_large` on the 16 KiB bound.
- Tests: `tests/marketing-event-details.test.mjs` (9),
  `tests/marketing-event-merge-sql.test.mjs` (4, PGlite).
- `tests/collector-deploy.test.mjs`: module list adds the two new modules.

## Verification

- 31/31 marketing tests (Stage 1 + 2, JS and SQL) pass.
- Collector deploy test 8/8; format, lint, file limits, build:api pass.
- PGlite is single-connection, so the merge test shows sequential merges keep
  both forms' fields; real concurrency relies on the single upsert statement.

## Follow-up (2026-11-20, user decision)

Blank optional answers now clear saved values (food and extras; required core
fields still cannot be blank). The user noted this relies on a slow or failed
prefill never showing an empty form, which is kept and commented. Added an
expected-version check carried in the modal custom ID, so a stale form is
refused instead of clearing newer answers, and the merge reports only keys it
actually removed. Stage 0 filters confirmed unchanged: hide tentative events,
keep today's finished events.

## Follow-up 2 (2026-11-20, user decision)

Kept the stale-form check, now per form: core and extras each have their own
saved version and may only touch their own fields, so a save of one never
invalidates the other. A refused stale save replies with the submitted answers
to copy. At the user's request the three new journal files were removed from
deploy commit 947c72a (now fc0692a) and left untracked; its milestone.md still
links to two of them.

## Limitations

Not committed, applied, registered or deployed. No live Discord test. A stale
form's answers are shown back to the user but must be re-entered by hand.

## Next

User review of Stage 2.
