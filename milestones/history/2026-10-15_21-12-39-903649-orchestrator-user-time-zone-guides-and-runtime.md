# User timezone guides and running API

- Local timestamp / acting role / milestone: 2026-10-15_21-12-39-903649; orchestrator; M32.
- Requested scope: make date-based Discord scans follow the user timezone.
- Starting repository state: shared dirty workspace, browser transport and backend implementation present, independent tests in progress.
- Work performed / changed files: documented date semantics in docs/discord-live-only.md, docs/assistant-backend.md and tests/info.md. Inspected backend helper, API, prompts, generic tool and RAM path. Restarted the existing paired local supervisor to load current API code.
- Decisions: first valid local-day instant, reject skipped dates, preserve explicit offset instants; UTC compatibility fallback; direct tools accept explicit timezone. Shared job schedules and source permissions remain unchanged.
- Checks and evidence: build:api passed, frontend production build passed with existing chunk-size warning, git diff --check passed. Initial combined root test run 130/131 passed; sole failure was obsolete date-only rejection, assigned to tester for contract update. Actual running API rejects invalid chat/tool zones with HTTP400; evidence/m32-user-time-zone/local-runtime-smoke.json. No bot/model calls for smoke.
- Resulting state / acceptance: runtime and guides updated; independent expanded verification and evaluation remain pending.
- Remaining work and handoff: integrate final coder/tester/evaluator reports; verify latest tests and journal completion. No cloud deployment or schema changes in this pass.
