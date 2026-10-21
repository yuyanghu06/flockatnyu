# Final review requests graceful startup exit correction

- Local timestamp / acting role / milestone: 2026-10-21_12-43-43-399637 America/New_York / evaluator / collector-crash-logging
- Requested scope: Add safe failure diagnostics to the Discord collector.
- Starting repository state: Concurrent chat-budget changes preserved and excluded from collector release.
- Work, decisions, checks and resulting state: Earlier cancellation, metadata-cause and cleanup findings are resolved; safe diagnostic fields and package scope accepted. Final review found a deliberate stop during Gateway startup still returns unavailable and executable maps it to exit1. Coder/tester assigned stopped-result and exit-status correction, including no listening marker after stopped startup; preserve prior fatal exit1. Native stderr remains explicitly outside structured-log sanitization. Deployment held until focused correction tests and acceptance.
- Remaining work and handoff: See rolling milestone and to-do.
