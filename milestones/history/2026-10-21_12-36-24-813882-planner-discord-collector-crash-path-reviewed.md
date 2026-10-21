# discord collector crash path reviewed

- Local timestamp / acting role / milestone: 2026-10-21T12:36:24.813882-04:00 / planner / Discord outage diagnosis.
- Requested scope: user reports Buildathon bot failure, then explicitly directs checking why the Railway Discord instance crashed.
- Starting repository state: clean after published timeout releasee40a81d.
- Work performed / changed files: Read-only Gateway/CLI/listener/checkpoint/SDK review. Fatal SDK Error, listener or event-refresh rejection, checkpoint timeout/conflict and pending overflow all collapse to collector_failed and exit1. Ordinary SDK SocketError is distinct and reconnects normally; periodic refresh/chat-hook errors do not directly terminate collector.49discord-events tests pass. Preserve durable checkpoint, source scope and one instance on recovery.
- Decisions: distinguish confirmed collector shutdown/retry exhaustion from unknown underlying fatal cause. No source messages, credentials or private model output retained.
- Checks and evidence: read-only source/log/status inspection and actual synthetic checks above; no historical-message replay or public Discord posts.
- Resulting state / acceptance: diagnosis recorded; crash triggering condition and sustained recovery remain unverified.
- Remaining work and handoff: content-free stage/code diagnostics and bounded failure recovery would allow exact future diagnosis; restart policy resilience needs follow-up. Do not widen channel access or discard checkpoints to address a process outage.
