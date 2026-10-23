# Isolated-tool rule recorded at user request

- Local timestamp / acting role / milestone: 2026-10-23T15:02:12.263425-04:00 / orchestrator / project instruction correction.
- Requested scope: add an explicit AGENTS.md rule keeping tools isolated and multi-tool workflows in agent prompts; explain why a map read can call Discord without a current attached Discord message.
- Starting repository state: prior documentation changes and diagnosis records preserved. Application and separate managed worktree untouched.
- Work performed / changed files: prepended the rule to AGENTS.md; refreshed root/folder guides and rolling journal/checklist. Existing source-access.js follows source URLs stored on map records, independently of attachments on the current chat message; that explains the hidden source fetch path, not which upstream caused the observed timeout.
- Decisions: applies to chat and autonomous planner; each tool owns its named service operation, with separate arguments/results/failures. Cross-service workflows belong in prompts, not compound tools, hidden adapter dispatch or mandatory runner call sequences. Local authentication/permission/field/version checks remain. Older bundled original-read requirements are superseded where they conflict.
- Checks and evidence: read back the added instruction and run git diff --check. This is a documentation-only rule, so no model evaluation, application tests, source/database writes or deployment was needed or performed. No independent specialist pass is claimed for this direct instruction edit.
- Resulting state / acceptance: requested persistent rule is recorded; existing runtime behavior remains unchanged and is not claimed fixed.
- Remaining work and handoff: future affected tool changes must follow the new rule. Refactoring/deploying the current map source-verification path is separate implementation work.
