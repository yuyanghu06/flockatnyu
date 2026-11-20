# Marketing Stage 1 review fixes and commits

- **Role:** coder (primary agent; no specialists spawned)
- **Date:** 2026-11-19, America/New_York

## Goal

Apply the user's Stage 1 review requests before Stage 2: allow threads inside
the two allowed channels, name the channels in refusals, and split Stage 1 into
reviewable commits with explicit paths (no push).

## Changes

- `server/marketing/config.js`: a thread is allowed when the interaction's own
  `channel` object has the same ID as `channel_id`, a thread type (10, 11, 12)
  and an allowed `parent_id`. Added `MARKETING_CHANNEL_NAMES`.
- `server/marketing/views.js`: both refusals now name #events-team and
  #marketing-and-content-team (override channels fall back to a mention).
- `tests/marketing-event-info.test.mjs`: thread allow test (command and dropdown,
  all three thread types) and three thread-shaped refusals.
- Commits: dispatcher, migration, /event-info, deploy changes (Stage 0 was
  already 7e855bc). `event-cli.js` wiring went into the deploy commit so every
  commit's packaging tests pass on their own.

## Verification

- `node --test tests/marketing-event-info.test.mjs`: 13/13 pass.
- See the final report for per-commit checks.

## Limitations

Nothing deployed, applied, registered or pushed.

## Next

Stage 2: `/event-details`.
