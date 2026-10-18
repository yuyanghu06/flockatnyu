# Structured map runtime contracts

- Local timestamp / acting role / milestone: 2026-10-17T20:13:50.664237-04:00 / coder / structured-map-prompt. Recorded together during final integration; stage evidence is distinguished below.
- Requested scope: Wire machine-readable map contracts into the actual update-agent prompt.
- Starting repository state: Existing prompt lacked a shared explicit people/event storage contract.
- Work performed / changed files: Added server/map/contracts.js; imported buildMapRecordPrompt in server/automation/prompt.js; refreshed owned map/automation guides. Exact flat schemas, frozen examples and semantic workflows cover identities, labels, source-time dates, partial edits, cancellation and unsupported tools.
- Decisions: Keep actual people_here/scheduled_events fields; current runtime event writes remain denied. Schemas describe storage and do not register tools.
- Checks and evidence: Coder syntax/build and schema/freeze checks passed; independent verification follows.
- Resulting state / acceptance: Implementation delivered locally; no schema/data/grant/UI/deployment changes.
- Remaining work and handoff: Default durations require explicit user policy; independently verify delivery and SQL parity.
