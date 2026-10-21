# Startup shutdown regressions pass

- Local timestamp / acting role / milestone: 2026-10-21_12-44-56-827726 America/New_York / tester / collector-crash-logging
- Requested scope: Add safe failure diagnostics to the Discord collector.
- Starting repository state: Concurrent chat-budget changes preserved and excluded from collector release.
- Work, decisions, checks and resulting state: Independent final focused96tests pass with0failures/skips. Diagnostics suite now47cases, including six final regressions for SIGTERM during connect and initial-delay resolve/reject, no false listening or failure markers, executable graceful exit0 and preservation of prior fatal1. Earlier broad307affected tests and parent full1755pass/1optional skip remain evidence; final delta covered by focused rerun. No live writes.
- Remaining work and handoff: See rolling milestone and to-do.
