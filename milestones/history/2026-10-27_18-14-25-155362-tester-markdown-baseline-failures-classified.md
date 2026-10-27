# Five broad-suite failures confirmed before prompt migration

- Local timestamp / acting role / milestone: 2026-10-27T18:14:25.155362-04:00 / tester / prompt-markdown-2026-10-27.
- Requested scope: Move all chat/update model instruction wording into one structured Markdown folder, organized by agent and tool, preserving behavior.
- Starting repository state: dev/tool-api-services02427ba with prior operation API, testing, readback correction and documentation changes preserved.
- Work performed / changed files: Ran the same three unchanged Discord/source/map suites against current code and the original source-only baseline. No repository edits in this diagnostic pass.
- Decisions: Preserve wording, dynamic values, control flow, permissions and existing unresolved findings.
- Checks and evidence: Both runs report 18 passed and the identical five failures: unregistered synthetic tool fixture rejection (three), pre-aborted summary domain-coverage expectation (one), private map capability expected across JSON API (one). Logs are linked in verification.md.
- Resulting state / acceptance: No migration regression established; five failures are existing API/test-contract findings.
- Remaining work and handoff: Keep these limitations explicit and preserve separate prior API work.
