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

`chat-steering.mjs` supplies a production app/runner with synthetic authentication, controlled provider timing and inert tools for admission, cancellation and stream races. `chat-steering-model.mjs` uses the production runner, registry and map adapters with synthetic storage; only injection timing is controlled during an actual-model run. No fixture creates live business-service clients. The companion harness pins sources and bounds all inference dispatches.
