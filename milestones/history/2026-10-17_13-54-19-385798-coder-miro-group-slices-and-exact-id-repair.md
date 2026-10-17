# Miro split groups and exact numeric IDs implemented

- Local timestamp / acting role / milestone: 2026-10-17_13-54-19-385798; coder miro_mixed_items_fix; M27 activation repair.
- Requested scope: actual split-group pagination and unsafe numeric wrapper identity failures.
- Starting repository state: failed initial capture, no accepted snapshot; live tools connected, daily paused.
- Work performed / changed files: server/miro/client.js, server/miro/snapshot.js, new tests/miro-group-pages.test.mjs. Root inspected actual implementation and updates guides.
- Decisions: numeric id source lexemes normalize exactly to strings, preserving other numbers; group-specific merging/raw original pages and membership envelopes; structural reads before expensive hydration; ordinary duplicate/auth/lease/budget/atomic publication guards retained.
- Checks and evidence: coder npm run test:miro PASS42/42, focused9/9 and syntax checks onNode25.8. Root previously verified exact-token capability onNode22.12. No coder live calls/config changes.
- Resulting state / acceptance: root accepts for continued verification, requests a focused correction before final review: optional group total must not be compared to unique group count for item-based pagination. Actual API lacks total; observed size countsfragments. Coder correction and independent review pending.
- Remaining work and handoff: correct optional-total semantics, run all-group live diagnostic before fresh full capture, verify real publication, deploy isolated repairedworker and enable daily. No schema/source-scope change.
