# Realistic testing and API evaluation preference recorded

- Local timestamp / acting role / milestone: 2026-10-22T18:22:46.403630-04:00 / side-conversation assistant / documentation preference only.
- Requested scope: add the user's testing preference and evaluator API-call authorization to AGENTS.md.
- Starting repository state: main-thread cache-read implementation and separate live testing are ongoing; this side conversation does not own those changes.
- Work performed / changed files: added a testing/evaluation section to AGENTS.md and persistent note in notes.md; recorded this pass without changing active runtime work.
- Decisions: prioritize actual use cases, meaningful edge cases, correct responses and outcomes; use existing compiler/type/build checks instead of duplicate syntax tests; permit bounded configured model/application API evaluations and distinguish them from scripted tests and live results.
- Checks and evidence: reread the inserted policy; scoped whitespace check. No runtime tests, API calls, code changes, test deletions or deployments were needed or performed.
- Resulting state / acceptance: requested policy recorded. Existing application/source access remains in force.
- Remaining work and handoff: main-thread implementation/testing/release work remains independent and unchanged by this note.
