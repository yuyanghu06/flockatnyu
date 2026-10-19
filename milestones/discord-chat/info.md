# Discord chat

Goal: let members invoke Flockbot in currently enabled, nonblacklisted eboard/team channels and eligible threads with normal mentions or replies, using the existing audited assistant and trusted triggering-member context.

Scope: independently implemented Discord transport, shared chat runner, server-owned audience/source policy, bounded transient history/rate/dedup state and safe delivery. No retained Discord index, additional source grants or personal account/history system.

Complete when independent tests and evaluation establish source/identity boundaries, website and collector regressions, and actual rollout state is accurately recorded. Current status: team repair is deployed on web84d6cf12 with the compatible active mention collector. Real team authorization and private hosted response generation pass; leadership remains blocked. Automatic hour/name context is verified. First organic delivery remains unobserved. Orchestrator owns shared tracking.
