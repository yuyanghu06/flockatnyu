# Miro daily quota diagnosed

- Local timestamp / acting role / milestone: 2026-10-18T18:48:52.654386-04:00 / orchestrator / live operations.
- Requested scope: Explain how to fix Miro.
- Starting repository state: Prior live recovery pushed; concurrent src/assistant.js and tests/assistant.test.mjs modifications preserved.
- Work performed / changed files: One private, bounded read-only official MCP canvas_search probe and live schema inspection; official Miro quota documentation read. Updated milestone snapshot, to-do and history folder guide only.
- Decisions: Upstream explicitly reports organization Free-plan 100-call daily quota exhaustion. Required tool arguments match; no schema bug identified. Reset is 00:00 UTC, next October 18 at 8 PM New York. Propose safe quota classification, metadata-only cooldown and budgeted less-frequent/batched live reads; no paid purchase or durable board cache.
- Checks and evidence: Probe isError true with explicit quota response; sanitized diagnosis only, no credential, board ID, private source content or returned upgrade URL persisted. Official reference https://developers.miro.com/docs/mcp-usage-and-daily-limits.
- Resulting state / acceptance: Cause established. No implementation, service changes or restored Miro sync claimed. Existing Discord/Calendar continuation remains the previously verified behavior; no new full-suite/model test needed for read-only diagnosis.
- Remaining work and handoff: Explain proposed fix; quota-aware scheduling remains unimplemented. Preserve concurrent UI edits.
