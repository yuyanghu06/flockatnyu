# Test fixtures

`discord-cli-signal-preload.mjs` replaces network fetches in the CLI signal test
with an inert abortable request. It belongs with test source rather than ignored
local evidence, so the test also works in a fresh checkout.

## Historical migration fixtures

These seven small fixtures preserve only algorithms and SQL-adapter contracts needed to verify immutable historical migrations: legacy-message, legacy-memory, legacy-summaries, legacy-summary-config, legacy-summary-schedule, legacy-summary-store and legacy-live-summary-store.

They are imported only by historical migration tests. They contain no runnable archive CLI, collector worker, vector provider or stored-summary fallback. Production server code and isolated deployment contexts must never import this folder. Current behavior is verified by the live Discord, event listener, catalogue, manual-disable and collector deployment suites.

## Current map configuration

`map-config.mjs` loads the actual map configuration for Node-only navigation and presentation tests. It inlines JSON that Vite normally imports and resolves JavaScript imports against their real file location. It contains no copied configuration values or production runtime fallback.

`chat-map-attendance.mjs` supplies simulated map storage and normal map tools for attendance checks, shared by repeatable orchestration cases and bounded real-model evaluations. It contains no live business data or credentials.

`chat-map-time.mjs` runs the production chat runner and map adapters against synthetic in-memory events. It records attempted and applied writes, applies complete snapshots, and checks exact optimistic versions. The clock and roster are fixed test inputs; it creates no live source, Calendar or database clients. `../chat-map-time-model.mjs` uses it for offline adapter checks and explicitly enabled, capped model evaluations.

`chat-map-recovery.mjs` reuses that simulated store to reproduce duplicate proposed participants, a stale version after a human edit, and a transaction that commits before its response is lost. Its prefix tool calls are explicitly scripted; `../chat-map-recovery-model.mjs` can then use the configured model to choose recovery under a hard inference cap. Scripted fixture checks establish the test mechanics, not the model's initial tool choices. Actual commits, confirmed receipts and failed responses are recorded separately.

planner-followup.mjs supplies synthetic current/backlog tasks, external boundary simulations and exact map/task preservation checks for the production planner runner/adapters. No credentials or live source data are included.

`chat-steering.mjs` supplies a production app/runner with synthetic authentication, controlled provider timing and inert tools for admission, cancellation and stream races. `chat-steering-model.mjs` uses the production runner, registry and map adapters with synthetic storage; only injection timing is controlled during an actual-model run. No fixture creates live business-service clients. The companion harness pins sources and bounds all inference dispatches.

`planner-followup.mjs` also supplies the synthetic task catalogue/exact-read storage interface used by current planner tests. Catalogue metadata is separate from full retained originals/history; each read can fail independently. Its integration-source adapter supplies this interface and required map-read context imports to extracted current constructors without editing closed historical evidence. No production fallback to full task listing is provided by these helpers.
