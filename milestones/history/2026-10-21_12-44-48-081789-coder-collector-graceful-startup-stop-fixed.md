# Graceful startup exit corrected

- Local timestamp / acting role / milestone: 2026-10-21_12-44-48-081789 America/New_York / coder / collector-crash-logging
- Requested scope: Add safe failure diagnostics to the Discord collector.
- Starting repository state: Concurrent chat-budget changes preserved and excluded from collector release.
- Work, decisions, checks and resulting state: Final event-cli-only correction returns stopped for cancellation during Gateway connect or metadata initial-delay resolution/rejection, suppressing misleading listening/failure markers. Executable maps graceful stopped to0 while preserving any prior fatal exit1. Coder96focused checks, syntax and diff checks pass. Implementation frozen; no restart/access changes.
- Remaining work and handoff: See rolling milestone and to-do.
