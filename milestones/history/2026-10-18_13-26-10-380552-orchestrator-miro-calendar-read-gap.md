# Miro calendar read-gap diagnosis

- Local timestamp / acting role / milestone: 2026-10-18T13:26:10.380552-04:00 / orchestrator / Miro diagnosis.
- Requested scope: explain why the chat agent cannot read the schedule shown in the screenshot.
- Starting repository state: many existing UI/event changes; all preserved.
- Work performed / changed files: read-only implementation and documentation inspection; journal files only updated.
- Decisions: treat readable schedule cells as an unresolved acceptance gap.
- Checks and evidence: tools/miro/index.js unsupported-content branches; src/assistant.js partial label; docs/miro-sync.md; https://developers.miro.com/docs/miro-rest-api-introduction and https://developers.miro.com/changelog/legacy-mcp-board-tools-have-been-removed.
- Resulting state / acceptance: Inspected the screenshot and current tools/miro/index.js: unsupported table objects are preserved as metadata with contentAvailable:false, and their pages return partial. Frame overview can succeed while calendar cells remain unreadable. Current official Miro REST documentation marks Table read unsupported; official MCP documentation describes table-capable access. This explains the observed refusal but the exact failing tool payload/HP date was not retrieved in this pass. No runtime changes, source reads, credentials, deployments or model calls. Next: verify the exact calendar widget through read-only table/canvas access and integrate a supported reader before claiming schedule acceptance.
- Remaining work and handoff: real calendar widget and successful date retrieval must be verified; no fix is claimed.
