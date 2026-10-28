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

`contacts-store.mjs` supplies a synthetic PostgREST persistence transport beneath the real contacts store and tools. It records attempted/applied writes, preserves exact timestamp strings and can simulate conflicts or a lost write response. `contacts-model.mjs` supplies nine realistic requests and saved-field assertions for the production chat runner. Its scripted provider checks fixture mechanics only; the companion harness separately records actual configured-model calls under fixed network/request limits. No fixture contacts live business services.

`contacts-ui.mjs` supplies synthetic directory rows and the real contacts API/store with test authentication and controllable failure responses. It supports both HTTP route checks and the local Chrome/Vite end-to-end UI test. Its production-session secrets are inert test strings; it creates no live business-service clients or model requests.

`treg-contacts.mjs` supplies synthetic Treg responses/PostgREST for direct-import and logging tests, including conflict-ignore inserts, exact email filters and failure-after-commit. It runs real application/client/store/logger code, allocates isolated private temporary logs and cleans them up. No live business service is accessed.

`gmail-enrichment.mjs` supplies invented sender/provider data and an explicitly simulated cache contract for isolated engine checks. Actual SQL tests separately use production migrations and fixed RPC transports. No real email/provider data or credentials belong in these fixtures.

Contacts fake PostgREST search delegates ranking/filtering to the actual048SQL in serialized PGlite snapshots, rather than copying ranking in JavaScript. Model fixtures expose both production Contacts/Attio adapters with synthetic persistence; corrected Attio record_text is required for honest valid provider responses.

planner-presence.mjs provides isolated Discord originals, Calendar/map/task storage and production planner adapters for missed-presence regression verification. It does not connect to live business services.

## Server cleanup import boundaries

Current fixtures import grouped server modules directly: `runtime` for app/service
composition, `chat` for the chat runner and context, `contacts` for saved people,
`treg` for provider lookup/import clients, `audit` for private logging and safe
diagnostics, and `auth`, `shared` and `knowledge` for their named responsibilities.
Synthetic source constructors resolve imports against those current files. The
facade exports remain the supported test interface; helper extraction does not
justify copied production behavior inside a fixture. Keep source pins in optional
model harnesses complete when a facade's implementation moves into helper files.

`chat-source-files.mjs` lists the current JavaScript files behind the grouped chat
facade. Optional model harnesses include that inventory and the helper itself in
their existing source hashes/copies, alongside explicit audit/Treg dependencies.
Its `operationSourceFiles` export also lists all server/tool JavaScript, fixed
`src/api/operations` route files and the trusted Drive skill Markdown asset so
endpoint foundation and backend dependencies stay in the optional evidence copy.
It reads filenames only and does not load clients or run model/business calls.

`treg-dormant.mjs` supplies shared synthetic client/logger/auth fixtures for the
split dormant Treg suites. `chat-source-files.mjs` inventories extracted chat
implementations for opt-in model source hashes/copies and prompt verification.

`planner-cost-cases.mjs` supplies synthetic attendance/no-change/missing-time/unavailable-source cases to the opt-in production-runner comparison. Preserve existing synthetic event URLs, fields, participants/buildings and unfinished originals as explicit expected outcomes. It provides no live access or credentials.
