# Markdown loader and packaged runners independently verified

- Local timestamp / acting role / milestone: 2026-10-27T18:14:25.155361-04:00 / tester / prompt-markdown-2026-10-27.
- Requested scope: Move all chat/update model instruction wording into one structured Markdown folder, organized by agent and tool, preserving behavior.
- Starting repository state: dev/tool-api-services02427ba with prior operation API, testing, readback correction and documentation changes preserved.
- Work performed / changed files: Added meaningful prompt-assets tests and updated relocated Drive, collector and runtime package tests. Verified actual runners and sanitized package prompt imports from unrelated working directories with empty environments.
- Decisions: Preserve wording, dynamic values, control flow, permissions and existing unresolved findings.
- Checks and evidence: 164 focused runner checks and 26 loader/Drive/package checks pass; final seven-check rerun covers stronger packaged imports. Syntax, scoped format and whitespace checks pass. No model/provider calls or live writes.
- Resulting state / acceptance: PASS assigned independent offline acceptance criteria.
- Remaining work and handoff: Root integrates results and broad-suite baseline classification; evaluator reviews final implementation.
