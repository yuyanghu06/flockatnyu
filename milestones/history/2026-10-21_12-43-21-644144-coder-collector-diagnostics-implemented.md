# Failure-stage logging implemented

- Local timestamp / acting role / milestone: 2026-10-21_12-43-21-644144 America/New_York / coder / collector-crash-logging
- Requested scope: Add safe failure diagnostics to the Discord collector.
- Starting repository state: Concurrent chat-budget changes preserved and excluded from collector release.
- Work, decisions, checks and resulting state: Added collector-diagnostics.js and integrated bounded stage/code/cause/HTTP/queue fields into Gateway, checkpoint RPC, metadata refresh and CLI startup/shutdown. Structured records exclude arbitrary errors, payloads and credentials; native Node fatal stderr remains unchanged. Explicit parent cancellation avoids false fatal diagnostics and interrupted checkpoint commits. Existing restart policy and access boundaries preserved. Coder106focused tests, API build and diff check pass. Independent review and release gates pending.
- Remaining work and handoff: See rolling milestone and to-do.
