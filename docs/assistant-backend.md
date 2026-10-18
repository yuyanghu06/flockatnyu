# Assistant and backend

The floating assistant uses a Hono API with server-only model and source credentials. Discord content is read live through the bot; no archive, durable summary/vector storage or stored-summary fallback remains. [Backend direction](backend-direction.md), [database tables](database-tables.md) and the [milestone snapshot](../milestones/milestone.md) describe current boundaries and rollout evidence.

## Local startup and interface

`npm run dev` loads ignored `.env` and `.env.google`, starts the API, verifies `/healthz` identifies `tech-nyu-api`, then starts Vite. `PORT` defaults to 3001 and drives the API and proxy. Frontend flags are forwarded. The supervisor stops its own children and refuses occupied API ports. Restart paired mode after backend edits; `npm run dev:api` provides watch mode and `npm run dev:web` runs Vite separately. Preview also needs a separate API.

The compact native dialog opens after campus readiness through the launcher or Cmd/Ctrl+K. Enter submits, Shift+Enter adds a line, and Escape/backdrop/close restore focus. Closing stops an unfinished reply. Completed history and drafts remain in memory until Clear or reload. Modal focus, wheel and WASD guards keep assistant input separate from map controls.

`/api/status` reports configuration without probing the model. API-unavailable, missing configuration and denied access are distinct states. Client status checks time out after eight seconds; retry preserves drafts. Secrets must never use `VITE_` variables.

## API and source access

`/api/chat` accepts bounded conversation, optional building ID and validated browser `timeZone`, then streams newline-delimited `meta`, `delta`, `done` or `error` records. Timeouts, cancellation and incomplete streams are explicit. Responses render as text, and source links accept only HTTP(S). Conversation count, characters and UTF-8 request size are bounded.

OpenAI-compatible Chat Completions and Anthropic Messages adapters use explicitly configured provider, model, API root and key. The browser cannot supply credentials. Shared source scope comes from `ASSISTANT_ALLOWED_SOURCE_IDS` (`DEV_ALLOWED_SOURCE_IDS` compatibility alias). Browser/model arguments cannot grant source access or administration. There are no per-person membership tables. Production protected routes remain closed until a production authentication policy is implemented.

The API captures one server clock for planning, retrieval and answers. Calendar-date Discord windows use the user's validated IANA timezone; legacy clients use explicit UTC. See [date behavior](discord-live-only.md#dates-and-user-timezone) for inclusive-start/exclusive-end bounds, DST and overrides. Google tools retain provider query syntax; this does not deterministically rewrite Gmail date queries.

## Read tools and independent collectors

Discord planning resolves channels and requested windows, then reads originals through the bot. Search locates messages and does not establish exhaustive period coverage. Larger summaries use bounded request-memory map/reduce with original citations. Failed, partial or denied reads disclose limits and never fall back to stored summaries. Live local access requires `DISCORD_LIVE_READ_ENABLED`, `DEV_LIVE_DISCORD_ENABLED`, server source scope and current bot/channel policy. See [Discord contract](discord-live-only.md).

Gmail/Drive read-only tools use backend OAuth and account-authorized scope without sends/file edits. The independent `gmail-events` receiver accepts signed notifications and has enqueued real email. See [Google connector](google-connector.md).

Miro has bounded read-only board/frame/item/relationship tools and a separate ingestion service. Original layout and explicit coverage limits reach model context. The `miro-sync` service exists with `MIRO_SYNC_ENABLED=false`; consult [Miro setup](miro-sync.md) for board coverage and freshness.

The Railway production environment contains running `discord-events`, running `gmail-events` and paused `miro-sync`, sharing Supabase. Discord receives new native events while preserving inherited exclusions; there is no message-history archive job. The [update agent handler](agent-automation.md) is implemented but not deployed, with no concrete Calendar/map write adapters. Collection does not invoke an LLM. The local supervisor starts only web/API processes.

Building/day activity and history views remain unfinished. Local fixture checks and historical live smoke tests are recorded in [tests](../tests/info.md) and the milestone; they do not prove current cloud health.
