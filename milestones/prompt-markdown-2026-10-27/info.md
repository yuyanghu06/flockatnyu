# Markdown prompt migration

Goal: put all chat/update-agent model instruction wording in one root prompts/ folder organized by agent, shared purpose and tool.

Scope: preserve exact rendered wording and runtime behavior while moving instruction strings, tool/field descriptions, conditional skills and model-visible feedback into named Markdown blocks. Code retains dynamic data, schemas, access checks, execution and limits. Existing concurrent work is preserved.

Completion criteria: complete source extraction; exact before/after prompt and description equivalence; simulated runner and loader failure checks; correct browser/server separation, deployment assets and copied-source fixtures; format/lint/file/build checks; independent evaluator acceptance. No deployment or paid/model/provider calls are required for a byte-preserving move.

Current state: Agent and tool instructions now load from one root prompts/ tree: 87 registered Markdown assets grouped by chat/update agent, shared purpose, named tool/service and retained legacy helper. JavaScript keeps dynamic values, structural schemas, source/identity checks, leases, versions, limits and execution. Exact extraction/AST checks, 28 complete chat outputs, 18 worker variants and 33 serialized exports/catalogues preserve the original wording and behavior. Independent loader, copied-source, packaged-import and actual offline runner checks pass. Formatting, repository lint, physical limits, API and frontend builds pass; evaluator ACCEPT. The full offline suite reports 3,033 passed, five failed and two skipped. Independent baseline reruns reproduce those same five existing operation-API fixture failures. Known planner and Drive/Calendar wording findings remain unchanged. No model/provider calls, live writes, deployment, commit or push occurred.

Next action: Deliver the completed local restructuring. Further wording changes, existing API-test repairs or release actions are separate scope.

[Verification and existing limitations](verification.md).

Later [actual-model verification](../prompt-markdown-live-2026-10-27/verification.md) completed with six semantic passes and two current behavior failures. Structural extraction acceptance and the earlier offline results are unchanged.
