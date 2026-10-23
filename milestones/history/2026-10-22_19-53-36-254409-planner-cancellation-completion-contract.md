# Cancellation completion contract

- Timestamp / role: 2026-10-22T19:53:36.254409-04:00 / planner
- User scope: Add cancellations to saved-task completion checks.
- Starting state: Prompt audit live; separate known source_review cancellation omission remains. Existing dirty tree and unrelated current work preserved.
- Work: Read-only inspection confirms adapter callback ignores cancellations. Contract adds a separate cancellation branch in adapters.js only, using actual ready receipts, exact task/source/pinned Calendar/deterministic ID, and fresh matching cancelled readback; explicit authorized already_absent requires successful exact empty readback.
- Decisions: Retain current upsert/map completion, cache-only reads, identity/lease/version checks and16/64. Sparse/failed/uncertain reads preserve task. No prompts/schema/config changes.
- Verification: No tests/model/source calls in planner pass. Independent tester owns real bundled integration fixtures and positive/negative/version behavior.
- Acceptance: Contract accepted, coder and tester have exclusive source/test ownership; reviewer and worker-only deployment follow.
