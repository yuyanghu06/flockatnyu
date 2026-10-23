# Chat time and queue contract accepted

- Acting role / milestone: independent planner / chat-time-spotlight-queue.
- Scope: read-only diagnosis and bounded implementation brief; no application or service writes.
- Findings: browser/runner timezone transport already works. Raw map timestamp proposals and raw-only result presentation leave model conversion errors possible. Spotlight busy guard blocks queued messages; Send becomes Stop and completed history updates only after success.
- Contract: chat-only starts_local/ends_local converted by IANA rules; exact corresponding unchanged raw strings and trusted presence start preserved. Reject dual inputs and DST gaps/folds before writes. Read/receipt local display is derived and not stored. Preserve source identity, relationships, expiry and optimistic revisions. Queue captures text/files/building, sends FIFO after completed history, has separate Stop and pause/resume after failure, retains drafts and bounds memory.
- Checks: node --test tests/assistant.test.mjs tests/user-time-zone-api.test.mjs tests/worker-local-time-display.test.mjs:36passed/0failed. These are baseline checks, not acceptance of either change.
- Result: implementation brief accepted. Two coders own separate backend/frontend scopes; planner is reused as independent tester preparing configured-model simulation with24dispatch hardcap. No geometry changes, live model calls, business writes or deployment in this planner pass.
