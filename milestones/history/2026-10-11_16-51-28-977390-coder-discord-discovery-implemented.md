# Discord discovery implemented

- Timestamp / role / milestone: 2026-10-11T16:51:28.977390-04:00 / coder / M18.
- Scope: Automatic guild channel/thread discovery, inherited blacklist and deferred embeddings.
- Starting state: Explicit-channel M17 collector; Railway paused.
- Files: server/discord/client.js, config.js, discovery.js.
- Implementation: Metadata guild inventory and active/public/joined-private/authorized managed-private archived threads; checkpointed generations/offsets/cursors; category-first ancestry, fail-closed exclusions and incomplete-generation protections; no message-history probes, joins or reader grants. Embedding configuration harddisabled.
- Checks: Coder49/49 discovery/client/sync/launch suite and syntax checks passed; mock pausedpreview/resume/categoryordering passed. Root separately observed13/13 initial discovery/calendar tests and23/23 launch tests, later SQL resetfixture needed update for intentional policyrevisionbump.
- State / limits: Local implementation complete, SQL/independent integration review pending. No hosted reset/migration/replacement deployment.
- Handoff: Accept only after independent SQL policy/reset/rollover checks; root owns docs/journals/live deployment.
