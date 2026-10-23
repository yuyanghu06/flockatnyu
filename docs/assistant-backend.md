# Assistant and backend

The floating assistant uses a Hono API with server-only model and source credentials. Discord content is read live through the bot; no archive, durable summary/vector storage or stored-summary fallback remains. [Backend direction](backend-direction.md), [database tables](database-tables.md) and the [milestone snapshot](../milestones/milestone.md) describe current boundaries and rollout evidence.

## Local startup and interface

`npm run dev` loads ignored `.env` and `.env.google`, starts the API, verifies `/healthz` identifies `tech-nyu-api`, then starts Vite. `PORT` defaults to 3001 and drives the API and proxy. Frontend flags are forwarded. The supervisor stops its own children and refuses occupied API ports. Restart paired mode after backend edits; `npm run dev:api` provides watch mode and `npm run dev:web` runs Vite separately. Preview also needs a separate API.

The compact native dialog opens after campus readiness through the launcher or Cmd/Ctrl+K. Enter submits, Shift+Enter adds a line, and Escape/backdrop/close restore focus. Closing shrinks/fades the dialog out over180ms without cancelling an unfinished reply. Tool/reply updates continue while hidden; reopening follows the latest hidden updates, and completed replies stay in conversation history. Only explicit Stop, loading failure and disposal cancel the request. Content growth animates the dialog height over280ms; reduced motion skips both effects. Completed history, drafts and queued messages remain in memory until reload. Enter or Send adds a follow-up to a visible FIFO queue while a reply runs; each message uses the preceding completed answer, its own attachments and the building selected when queued. Remove/Clear affect pending messages only. A separate Stop control pauses the queue and retains the incomplete message for explicit Resume; failures also pause without overwriting newer drafts. Loading failure retains paused work, while disposal clears it. Limits are10active/waiting messages and20MiBfiles across those messages and the draft. Stop shows a streaming spinner; reduced motion keeps it static. Clear chat remains absent. Modal focus, wheel and WASD guards keep assistant input separate from map controls.

`/api/status` reports configuration without probing the model. API-unavailable, missing configuration and denied access are distinct states. Client status checks time out after eight seconds; retry preserves drafts. Secrets must never use `VITE_` variables.

## API and source access

`/api/chat` accepts bounded conversation, optional building ID and validated browser `timeZone`, then streams newline-delimited `tool`, `meta`, `delta`, `done` or `error` records. `tool` records may arrive before metadata and include only a request-local `id` (`tool-1` through `tool-4`), registered `name`, and `status` (`running`, `completed`, `partial`, `failed`). They describe actual retrieval execution and carry no arguments/result bodies. Timeouts, cancellation and incomplete streams are explicit. Assistant responses render streaming Markdown with raw HTML disabled; source links accept only credential-free HTTP(S) and remote Markdown images render as alternative text. User messages remain literal text. Conversation count, characters and UTF-8 request size are bounded.

OpenAI-compatible Chat Completions and Anthropic Messages adapters use explicitly configured provider, model, API root and key. The browser cannot supply credentials. Shared source scope comes from `ASSISTANT_ALLOWED_SOURCE_IDS` (`DEV_ALLOWED_SOURCE_IDS` compatibility alias). Browser/model arguments cannot grant source access or administration. There are no per-person membership tables. Production protected routes remain closed until a production authentication policy is implemented.

The API captures one server clock for planning, retrieval and answers. Calendar-date Discord windows use the user's validated IANA timezone; legacy clients use explicit UTC. See [date behavior](discord-live-only.md#dates-and-user-timezone) for inclusive-start/exclusive-end bounds, DST and overrides. Google tools retain provider query syntax; this does not deterministically rewrite Gmail date queries.

## Read tools and independent collectors

Discord planning resolves channels and requested windows, then reads originals through the bot. Search locates messages and does not establish exhaustive period coverage. Larger summaries use bounded request-memory map/reduce with original citations. Failed, partial or denied reads disclose limits and never fall back to stored summaries. Live local access requires `DISCORD_LIVE_READ_ENABLED`, `DEV_LIVE_DISCORD_ENABLED`, server source scope and current bot/channel policy. See [Discord contract](discord-live-only.md).

Gmail/Drive read-only tools use backend OAuth and account-authorized scope without sends/file edits. The independent `gmail-events` receiver accepts signed notifications and has enqueued real email. See [Google connector](google-connector.md).

Both agents use bounded official Miro MCP search/canvas/table tools. Contents stay in request memory; the REST tool and snapshot service are retired. See [Miro setup](miro-sync.md).

The Railway production environment contains running `discord-events` and running `gmail-events`; the former `miro-sync` service is deleted, sharing Supabase. Discord receives new native events while preserving inherited exclusions; there is no message-history archive job. The [update agent handler](agent-automation.md) is implemented but not deployed, with concrete fixed-target Calendar and normalized map adapters; activation and Google access remain separate. Collection does not invoke an LLM. The local supervisor starts only web/API processes.

Building/day activity and history views remain unfinished. Local fixture checks and historical live smoke tests are recorded in [tests](../tests/info.md) and the milestone; they do not prove current cloud health.

## Chat Calendar reads

The chat agent exposes list_calendar_events and read_calendar_event through the existing Google tool adapter. Trusted Google access authorizes reads only of GOOGLE_CALENDAR_ID; Calendar writes stay with the update agent. Events, times, locations, descriptions, source links and pagination reach model context. Current local API read access is verified; the user-confirmed sharing issue is resolved for reads. No production deployment or new Calendar-write grant follows.

The chat agent also exposes the dedicated bug_reports write tool for actual product bugs reported by the current user. Unlike retrieval tools, it records structured JSON and a server-owned original message in the service-only bug_reports table, confirming only successful receipts. See [bug report contract](bug-reports.md).

## Shared long-term memory

Chat loads one shared agent_memory text note into planning and answer prompts. The model proactively maintains useful durable club context through update_memory, without requiring users to ask. Core instructions remain code-owned. Read/optimistic-write tools use the existing trusted chat boundary; raw source archives and current-event authorization are unchanged. See [memory contract](long-term-memory.md).

## User-directed Calendar changes

Chat supports explicit create/edit/soft-cancel requests for the configured club calendar through request-bound tools, separate from autonomous Miro reconciliation. Exact current-request event reads and hidden revisions precede edits/cancellations; patches preserve unspecified fields. Recurring, attendee-bearing and special events remain unsupported. See [chat behavior](chat-agent-prompt.md). Drive search/read already uses the authorized Google connector; metadata and bounded content limitations remain explicit.

Chat accepts optional validated user attachments while message content stays a plain string for action authorization. The current bounded format set is PNG/JPEG/WebP, PDF and UTF8 text/code, with at most4 retained files,5MiB/file,10MiB decoded total and smaller text limits. Files stay in process/browser memory and travel as inline native provider content; no upload storage or account identity is created. Current chat attendance and other map updates use read_map_events, lookup_map_person and upsert_map_event. The verified Discord speaker or a supplied unique roster name resolves identity; the model asks about ambiguous people/events and preserves context through clarification. Existing source visibility, field validation, complete snapshots and revision checks remain. Only an applied mapWrite receipt confirms saving.

Upload API formats follow the official [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs) and [image inputs](https://developers.openai.com/api/docs/guides/images-vision) contracts checked2026-10-18. Current Chat Completions file blocks support PDF; DOCX/XLSX need a separate extraction/Responses path. Native image/PDF/text delivery was verified against the actual configured Luna using synthetic fixture codes, with no club-original data.
