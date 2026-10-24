# Checkpoint save failure traced to existing size gate

- Local timestamp / acting role / milestone: 2026-10-23_20-00-54-481110 America/New_York; read-only planner diagnosis; planner saved-task loading.
- Requested scope: identify remaining explicit SQL invalid_request branches after Node save validation, without edits or external calls.
- Starting repository state: unchanged039save RPC; deployed catalogue/read release.
- Work performed / changed files: inspected task-store validation, finishCycle call sites and039function; no edits by specialist.
- Decisions: for valid JSON-serializable checkpoint input under current Nodevalidation/scope/sourceUUIDs/noexplicitexpiry, octet_length(p_info::text)>262144 is the sole remaining explicit SQL invalid_request gate. Stale lease, forbidden sources, conflict and expiry return distinct statuses.
- Checks and evidence: task-store validates compact JSON.stringify bytes<=262144. SQL measures normalized JSONB::text, which may be larger. finishCycle passes{uuid,info}, so store sends p_expires_at:null. Repository contains no later save/helper replacement. No exact attempted payload was retained or measured.
- Resulting state / acceptance: supported diagnosis is checkpoint exceeding the existing database representation limit despite compactJSON acceptance. This is separate from fixed catalogue/read loading.
- Remaining work and handoff: do not truncate retained context or raise bounds as an incidental fix; design retention of new execution history at the existing limit. Orchestrator owns current status and evidence.
