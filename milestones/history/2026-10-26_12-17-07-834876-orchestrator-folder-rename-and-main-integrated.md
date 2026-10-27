# Folder rename and main integration completed

- Local timestamp / acting role / milestone: 2026-10-26T12:17:07.834876-04:00 / orchestrator / folder rename and main integration.
- Requested scope: Check folder rename and pull main while preserving current work.
- Starting repository state: Local uncommitted operational records and rename audit; codex/dev initially fba416a, origin/main24commitsahead.
- Work performed / changed files: User requested checking the renamed folder and then pulling main. Restored local Railway CLI link and corrected two startup paths; no application fix needed. Preserved dirty/untracked documentation with a temporary stash, fast-forwarded codex/dev by24commits from fba416a to origin/main4e974d0, restored all work and resolved four journal-only conflicts by retaining both sides. Independent preservation review and post-pull builds/local checks complete. No commit, push, deployment, restart, schema or business-data mutation. Unrelated stale collector test expectation remains reported; temporary backup may be dropped only after verified restoration.
- Decisions: Keep historical paths as history, preserve upstream updates and local notes, report unrelated failures separately.
- Checks and evidence: Exact relevant commands/outcomes recorded above; private CLI/env values are excluded.
- Resulting state / acceptance: Assigned pass accepted within stated scope; HEAD4e974d0 and retained work remain uncommitted.
- Remaining work and handoff: No remaining requested rename/pull work. Unrelated collector-test mismatch and upstream product backlog remain separate.
