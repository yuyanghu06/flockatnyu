# Direct chat map save implemented

- Local timestamp / acting role / milestone: 2026-10-22T15:45:16.800258-04:00 / coder, serialized by orchestrator / chat-map-clarification.
- Requested scope: Dedicated direct declaration tools and backend save service.
- Starting repository state: Concurrent staged Calendar pipeline, receipt, draft and concurrency work preserved. User selected saving during chat after routing explanation.
- Work performed / changed files: Added server/map/chat-activity.js and tools/map/chat-activity.js only. Resolver/save selections validate fixed roster/building/timing, create server-generated chat references, retain original report clock in bounded session-specific metadata cache, recheck final state and prevent duplicate replay.
- Decisions: Direct declarations use genuine application-owned provenance; existing provider-backed and autonomous-worker source/identity checks remain independent. Unknown or insufficient facts do not save.
- Checks and evidence: 69 focused direct/activity/attendance/source/event checks passed, syntax and whitespace passed. Independent findings corrected subject binding, ambiguous duration/destination, malformed/timezone qualifiers, JSONB key order, unlinked Discord named fallback and distinct fresh report IDs.
- Resulting state / acceptance: Implementation locally accepted for integration. No external source/model calls, schema changes, deployment or commits.
- Remaining work and handoff: Parent owns runtime integration, prompts/guides and independent final acceptance.
