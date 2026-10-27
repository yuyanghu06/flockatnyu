# Update-agent prompt sources traced

- Local timestamp / acting role / milestone: 2026-10-27T17:54:20.159350-04:00 / planner / prompt-inventory-2026-10-27.
- Requested scope: Summarize current update/planner prompt assembly and all model-visible supporting instruction layers.
- Starting repository state: dev/tool-api-services at 02427ba with existing uncommitted operation-API, test and documentation work preserved.
- Work performed / changed files: Traced automation/prompt.js legacy and staged builders, handler assembly, adapter and staged task tool definitions, prepared context, fragments, task catalogue, errors/recovery, shared Drive injection and provider serialization. No files changed by the planner.
- Decisions: Both legacy and staged code paths remain reachable depending on the staged setting. There is no separate worker answer prompt. Successful initial finish triggers the explicitly separate runner-originated Calendar-to-map sync; later syncs are model-selected.
- Checks and evidence: Read-only source tracing: prompt.js:27/47/105/114; handler.js:136/279/402; adapters.js:52; staged-pipeline.js:436/438/474. No tests, inference, live reads or configuration checks.
- Resulting state / acceptance: Standard bundled worker inventory complete. Live staged flag and deployment parity unverified; current unmatched-attendee preservation failure remains unresolved.
- Remaining work and handoff: Parent combines inventory with shared tool/context sources and preserves prior failed verification evidence.
