# Batch cap and repeated-cycle work traced

- Local timestamp / acting role / milestone: 2026-10-25_16-55-11-353478 America/New_York / researcher-batching / planner-throughput-2026-10-25.
- Requested scope: diagnose two-input batches and slow current planner throughput.
- Work, checks and evidence: Read-only local code/receipt investigation. Source default20; Oct18 five-input recovery569.325s prompted explicit5→2production tuning, retained by later releases. Trigger30inputs/30minutes differs from claim cap; retry lane1. Every successful initial finish separately syncs both Calendars and can expose all eligible saved tasks for follow-up. Calls execute serially under one global lease; cooldown runs from start. No edits/network/inference.
- Result and handoff: bounded diagnosis accepted; see ../planner-throughput-2026-10-25/info.md. No implementation or tuning performed.
