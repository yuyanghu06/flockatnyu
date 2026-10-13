# Discord policy and original-memory storage

- Timestamp / role / milestone: 2026-10-11T16:52:53.253520-04:00 / coder / M18.
- Scope: Service-only policy/discovery/time groups and safe Discord-only reset.
- Files: SQL003, server/discord/store.js and memory.js.
- Implementation: Defaultpaused policy, inherited ancestry/generation/revision guards, metadata checkpoints, paginated source-granted group APIs, original daily/weekly/monthly exclusive memberships. Policy row locks plus shared guild-memory serialization prevent stale reset/blacklist pages and inconsistent bucket counts. Reset preserves policy/operator/config/ACL/unrelated data, clears Discord originals/derived state and bumps revision.
- Decisions: No summaries/modelcalls/vectors; image metadata scrubbed with matching textSHA256. Classification atomically rewrites one guild's memberships; currently not incremental, suitable for initial rebuild and bounded by database/runtime deadlines.
- Checks: Coder18/18 storage/memory plus14legacySQL/store, API/syntax/diffcheck; own genuinePGlite fullgeneration/ACL/reset and15NYSQL-JS boundary comparisons passed. Root94/94 Discord and33/33 assistant suites also passed against current integration. Independent final addedcoverage/evaluation still active.
- State: Local schema and integration ready for independent acceptance; Railway paused; 10,212 oldoriginals remain. No new hosted schema/reset/deploymentyet.
- Handoff: Evaluator review and tests, then applySQL003 and pausedpolicy before authorizedscopedreset/rebuild.
