# Named tool instructions and field guidance moved into Markdown

- Local timestamp / acting role / milestone: 2026-10-27T18:10:28.383934-04:00 / coder / prompt-markdown-2026-10-27.
- Requested scope: Move all chat/update model instruction wording into one structured Markdown folder, organized by agent and tool, preserving behavior.
- Starting repository state: dev/tool-api-services02427ba with prior operation API, testing, readback correction and documentation changes preserved.
- Work performed / changed files: Moved141literals/templates from24service/schema modules into53tool-organized Markdown assets, preserving machine schemas and the unused legacy map builder API.
- Decisions: Preserve wording, dynamic values, control flow, permissions and existing unresolved findings.
- Checks and evidence: 141exact payloads,24restored ASTs and syntax match;33serialized exports/catalogues plus generated map/Calendar schemas and legacy prompt match. Scoped lint/format/line limits pass; focused simulated-service tests51pass/0fail/1existing optional skip.
- Resulting state / acceptance: Tool extraction accepted for integration with no wording or behavior changes.
- Remaining work and handoff: Root completes packaging/asset registry, meaningful independent checks and final review.
