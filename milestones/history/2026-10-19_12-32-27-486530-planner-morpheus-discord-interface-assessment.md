# Morpheus Discord interface assessment

- Local timestamp / acting role / milestone: 2026-10-19T12:32:27.486530-04:00 / independent planner / Morpheus read-only feasibility review.
- Requested scope: assess reuse for Flockbot indexing and direct Discord interaction alongside website; no implementation.
- Starting repository state: production feedback/audit work and existing user changes preserved. Morpheus inspected in an isolated /tmp checkout at 01e6700269e48c113a5b1fd4447f9e7e558b42f1.
- Work performed / changed files: source/test/documentation inspection only; orchestrator records this report in journal. No application/config/schema changes.
- Decisions and findings: Actual mention/reply triggers, public /ask and /background, role/rate/outstanding gates, typing, chunked no-ping replies and persisted job delivery exist; this path has no DM support. Useful patterns are separable from Bun SQLite, Cursor SDK/Grok workers and Mac Mini/Tailscale hosting.

Recommend a thin trusted Discord transport around Flock's existing assistant, independent of indexing. Decide source scope for the entire output audience, not only the asker; preserve leadership blacklist/team opt-in and private Google boundaries. Do not reuse broad website operator identity or per-channel model history across changing scopes. Private delivery must never fall back to public announcements. Keep model latency off collector checkpoint processing. Scope judgment: narrow /ask 1–2 engineer-days; tested mention/reply/thread and delivery controls 3–5 total days; broader identity/private access/history 1–2+ weeks. Estimates are not measured implementation results.
- Checks and evidence: read-only rg, cat, sed, nl and git status; current AGENTS, notes, milestone/to-do and workflow read. Source/test fixtures inspected, not executed; no installs, model calls, bot source reads, service changes or deployments.
- Resulting state / acceptance: bounded comparative review complete; proposed work remains unapproved.
- Remaining work and handoff: independent synthesis review and user decision. No implementation follows from the assessment.
