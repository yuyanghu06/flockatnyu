# Chat and shared instructions moved into Markdown

- Local timestamp / acting role / milestone: 2026-10-27T18:10:28.383932-04:00 / coder / prompt-markdown-2026-10-27.
- Requested scope: Move all chat/update model instruction wording into one structured Markdown folder, organized by agent and tool, preserving behavior.
- Starting repository state: dev/tool-api-services02427ba with prior operation API, testing, readback correction and documentation changes preserved.
- Work performed / changed files: Changed17owned source modules, relocated108prose expressions into110blocks/21assets, moved Drive guidance, and split browser-safe attachment-contract.js from server provider message formatting. Preserved concurrent post-write cache correction.
- Decisions: Preserve wording, dynamic values, control flow, permissions and existing unresolved findings.
- Checks and evidence: Exact108text values and15restored ASTs match;28planning/answer outputs across14conditional scenarios byte-identical; Drive, Contact, summary and uploaded-text outputs match. Scoped syntax/lint/format pass. Initial39offline checks passed with2temporary registry-load failures; shared registry is now refreshed and independent retesting is underway.
- Resulting state / acceptance: Chat extraction accepted for integration; shared final regression/package review remains pending.
- Remaining work and handoff: Root refreshes guides/registry and independent tester verifies final shared tree.
