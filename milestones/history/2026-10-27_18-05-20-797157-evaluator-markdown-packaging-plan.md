# Markdown migration packaging and verification plan reviewed

- Local timestamp / acting role / milestone: 2026-10-27T18:05:20.797157-04:00 / evaluator / prompt-markdown-2026-10-27.
- Requested scope: Move all chat/update model instruction wording into one structured Markdown folder, organized by agent and tool, preserving behavior.
- Starting repository state: dev/tool-api-services02427ba with prior operation API, testing, readback correction and documentation changes preserved.
- Work performed / changed files: Read-only review identifies runtime and collector graph allowlists, explicit asset packaging, module-relative loading, source-copy inventories and custom model walkers. Specifies exact prompt/tool equivalence and offline real-runner checks.
- Decisions: Preserve wording, dynamic values, control flow, permissions and existing unresolved findings.
- Checks and evidence: Static scripts and tool-contract sources inspected; no tests, model calls or provider access.
- Resulting state / acceptance: ACCEPT verification plan; final implementation evaluation remains pending.
- Remaining work and handoff: Root updates packaging and source copies; tester exercises actual loader/assets and simulated runners.
