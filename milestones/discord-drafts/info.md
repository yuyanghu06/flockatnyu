# Discord message drafts

Goal: let Flockbot prepare a message addressed to another currently eligible channel and show it for review in the invoking conversation.

Scope: a Discord-only draft tool, current actor/bot destination authorization, bounded exact target resolution, request-local results and shared planning/answer integration. No Discord posts, native draft persistence, target-message reads, source-scope widening, schema changes or map fixes.

Completion requires independent tests and review of permission/blacklist/revocation/ambiguity/cancellation boundaries, absence from website/worker tools, faithful result projection, privacy and unchanged delivery routing. Status: implementation, 63 new tests/413 focused regressions and independent evaluation accepted locally; web release908d744d is SUCCESS and hosted health/Discord authorization checks pass; real-model wording/delivery remains untested. Current evidence and remaining work live in ../milestone.md and ../to-do.md.

The adapter remains included in the latest web10f3a363 receipt release. Full integration now has2297passing tests/1optional skip and successful hosted access checks. Exact actual runtime factory/provider propagation and real production-settings metadata-only draft preparation were verified; no test message was sent.
