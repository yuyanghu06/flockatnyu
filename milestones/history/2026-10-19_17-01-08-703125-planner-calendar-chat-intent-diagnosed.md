# Calendar chat intent regression diagnosed

- Acting role / scope: planner and orchestrator; diagnose the reported Discord Calendar refusal.
- Starting state: clean codex/dev at 3b4aa82; live web already contains shared Calendar write tools.
- Inspected: tools/calendar/chat-intent.js, tools/calendar/chat.js, server/assistant-context.js, Discord adapter/bridge and existing Calendar/parity tests.
- Finding: the current gate rejects colloquial please abbreviations and affirmative follow-ups, and recognizes only the first action in coordinated create/cancel requests. This reproduces missing write capabilities locally; exact private production model records were not queried.
- Evidence: direct parser calls reproduce both reported refusals and the missing second capability. Independent planner ran 52 existing Calendar/parity/context cases successfully, showing the coverage gap.
- Decision: support bounded current-user colloquial directives and coordinated actions; a confirmation can reuse only the same user's immediately pending Calendar request, never source text or an assistant suggestion alone. Preserve fixed calendar, Google grant, fresh revision reads and saved-receipt reporting.
- Ownership: coder owns intent/request plumbing and prompt; independent tester owns a new integration test file; orchestrator owns journal/release.
- Status: implementation and independent regression tests underway. No source mutations, model calls or deployments in this pass.
