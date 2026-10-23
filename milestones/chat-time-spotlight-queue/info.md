# Chat local times and Spotlight queue

Fix chat map clock conversion and let members queue follow-up messages during a reply. Chat accepts local date/clock input and the server resolves IANA timezone rules; saved UTC timestamps remain instants. Spotlight sends pending messages in order with completed history and pauses after stop/failure.

Acceptance requires meaningful map adapter checks, bounded configured-model conversations with simulated storage, independent review, and desktop/mobile queue browser evidence. Current status is recorded in../milestone.md. No data repair or deployment is implied by this local implementation pass.

The user added failed-map-upsert lookup-loop recovery before release. Preserve accepted time/queue changes; safe validation feedback, equivalent-call deduplication and prompt-guided recovery require their own meaningful component/model checks and final acceptance. No budget or timeout change is authorized.

Exact read comparison implementation and freshness review recorded in [this pass](../history/2026-10-23_18-26-20-196081-coder-exact-read-comparison-reviewed.md). Configured-model acceptance remains pending.

[Independent core recovery acceptance](../history/2026-10-23_18-30-28-074755-evaluator-lookup-loop-core-accepted-with-limitation.md) retains the strict failed redundant-save case and production relationship-metadata limitation. Final time/target regression remains.

Bounded prompt hierarchy plan: [target before recovery](../history/2026-10-23_18-32-42-311488-planner-map-target-decision-order.md). The combined wrong-target gate is blocking; diagnostic/comparison/service code stays frozen.

The hierarchy-only gate remains [failed](../history/2026-10-23_18-36-23-838663-tester-hierarchy-target-gate-still-blocked.md); a zero-tool-call clarification interface correction is pending.

Current status: independent scoped release ACCEPT. [Final model evidence](../history/2026-10-23_18-43-00-506581-tester-final-time-recovery-current-runtime-pass.md) and [semantic acceptance](../history/2026-10-23_18-43-00-506582-evaluator-chat-time-queue-recovery-release-accepted.md). Web deployment/read-only hosted verification remain. Strict redundant-save objective remains failed/unrerun; no automatic old-entry repair.
