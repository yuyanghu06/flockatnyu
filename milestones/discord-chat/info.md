# Discord chat

Goal: let members invoke Flockbot in currently enabled, nonblacklisted eboard channels and eligible threads with /ask, mentions or replies, using the existing audited assistant and trusted triggering-member context.

Scope: independently implemented Discord transport, shared chat runner, server-owned eboard source policy, bounded transient history/rate/dedup state and safe delivery. No retained Discord index, additional source grants or personal account/history system.

Complete when independent tests and evaluation establish source/identity boundaries, website and collector regressions, and actual rollout state is accurately recorded. Current status: implementation in progress; no live interaction activation claimed. Orchestrator owns shared tracking.
