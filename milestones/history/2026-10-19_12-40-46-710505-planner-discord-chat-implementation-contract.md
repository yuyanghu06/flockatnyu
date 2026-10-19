# Discord chat implementation contract

- Local timestamp / acting role / milestone: 2026-10-19T12:40:46.710505-04:00 / independent planner / discord-chat.
- Requested scope: user authorized Discord interaction functionality, verified triggering-user context, and all nonblacklisted eboard destinations. No indexing requested.
- Starting state: accepted read-only Morpheus assessment; existing production feedback/audit work preserved.
- Work performed / changed files: planner inspected app/runtime/assistant context and existing Gateway/deployment boundaries; no planner edits. Orchestrator assigned exclusive shared-runner and transport coders, then independent access/bridge tester. Parent owns integration/journal.
- Decisions: independent implementation of Discord behavior without copying unlicensed source; shared audited runner; signed internal service transport; existing Gateway optional nonblocking interaction hook. Current policy/metadata/source UUID intersection governs eboard destinations. Trigger actor identity injected into both prompts; labels never grant source/action authority. Discord profile omits global memory and private account tool adapters. No separate role gate beyond eligible guild member/channel.
- Checks and evidence: read-only source inspection, official Discord interaction/Gateway/channel documentation consulted. Source plan only; implementation/test work in progress.
- Resulting state / acceptance: plan accepted with user steering incorporated. No archive/schema changes.
- Remaining work and handoff: implement runner/transport/access/bridge, test independently, evaluate and integrate; only then consider activation within authorized deployment scope.
