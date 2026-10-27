# Contacts target and Calendar completion instructions tightened

- Local timestamp / acting role / milestone: 2026-10-27T18:55:37.632943-04:00 / coder / prompt-clarification-completion-2026-10-27.
- Requested scope: Tighten prompting for ambiguous Contacts writes and repeated Calendar searches exposed by actual-model verification.
- Starting repository state: dev/tool-api-services02427ba with the local Markdown migration and concurrent operation-API/readback/test work preserved.
- Work performed / changed files: Changed nine Markdown files/eleven existing blocks: Contact main workflow/search/read/update/delete, Calendar workflow/list description, chat routing/planning. No new prompt identifiers, schemas, limits or runtime logic.
- Decisions: Prompt wording only; preserve backend checks, tool isolation, schemas, execution bounds and unrelated workflows.
- Checks and evidence: All87assets validate; six chat variants assemble. Static diff preserves all identifiers/placeholders/separators and unrelated wording. No inference by coder.
- Resulting state / acceptance: Implementation ready for independent static review and real-model validation.
- Remaining work and handoff: Root/evaluator inspect scope and precise fallback conditions before tester freeze.
