# Quota deferral integrated into shared tools and update worker

- Local timestamp / acting role / milestone: 2026-10-18T18:53:55.857787-04:00 / coder / Miro quota recovery.
- Requested scope: Implement and deploy quota-aware live Miro reads while preserving Discord/Calendar processing.
- Starting state: Concurrent frontend edits preserved; earlier diagnostic identified exhausted 100-call Free-plan daily quota.
- Work performed / changed files / checks / result / handoff:

Integration coder changed server/automation/adapters.js, tools/miro/mcp.js, outage tests and owned guides. Background session starts once per batch; safe quota statuses/retryAt remain content-free. Fresh authorization gates denials; deferred boards do not repeat calls and mid-batch failures remove prior Miro mutation authority. Discord/Calendar processing and mandatory Calendar projection remain available. Fourteen outage cases and151focused combined checks passed, zero skipped; owned whitespace passes. Prompt unchanged, no model/cloud/deployment work. Parent full regression and independent transport review pending.
