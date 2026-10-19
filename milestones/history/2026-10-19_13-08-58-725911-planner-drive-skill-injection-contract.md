# Drive skill injection contract

- Acting role: independent planner; user authorized a new automatically injected Tech@NYU Drive skill.
- Starting state: chat had search/read; autonomous planner exposed Gmail only. Private research stays outside Git.
- Inspected: assistant-context, Google tools/client, automation handler/adapters, deployment packager and representative tests.
- Decision: shared reviewed Markdown skill; brief discovery guidance, activate and replan before first selected Drive execution; retain context for request/batch and chat answer. Add live paginated folder navigation and parent-scoped literal search. Existing Google/batch/source gates remain; Drive does not establish write provenance.
- Ownership: coder owns Google client/tools/adapters; orchestrator owns shared skill/injection/packaging/docs; tester independently owns new lifecycle acceptance.
- Checks: read-only source inspection and tool counts (17 existing, 20 with three Drive tools; preserve cap24). No tests/model calls/source writes/deployment in planning.
- Acceptance: selective activation, both runtimes, pagination and denial behavior, no private inventory in packages, source-write boundaries preserved. Implementation/testing pending.
