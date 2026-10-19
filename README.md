# Flock@NYU

Tech@NYU's shared club assistant, with an interactive 3D map of NYU's Washington Square campus. Ask about club updates, schedules and resources, or select a building to see its upcoming activities and participants.

The [live site](https://flock.techatnyu.org) requires the shared site password. The frontend and Hono chat API run together on Railway; independent collectors and an autonomous planner share Supabase. Current verification, operational limitations and unfinished work live in the [milestone snapshot](milestones/milestone.md).

## What it does

- **Chat:** answers using authorized live Discord, Google Calendar, Gmail, Drive and Miro tools, with original source links. Source availability and permissions determine what it can retrieve.
- **Autonomous planner:** processes eligible incoming updates, reconciles supported club events into the configured Google Calendar, and projects scheduled events and supported informal plans onto the map. Ambiguous identities or conflicting evidence require deferral.
- **Campus map:** detailed selectable buildings, activity cards, attendee portraits, roads, sidewalks and park geometry. Activities retain their timing and source provenance; planned attendance does not verify physical presence.

Calendar is the canonical scheduled club-event view. Miro is read-only. Gmail and Drive tools are read-only. Map updates use source-backed events and existing building/person catalogues. See [events](docs/events.md), [chat behavior](docs/chat-agent-prompt.md) and [planner behavior](docs/update-agent-prompt.md) for the boundaries.

## Run locally

Use Node.js **22.12 or newer**. Install dependencies and, if you do not already have local settings, copy `.env.example` to an ignored `.env` and configure the integrations you need.

```sh
npm ci
npm run dev
```

This starts the API, checks its health, then starts Vite, normally at http://127.0.0.1:5173. `PORT` sets the API and proxy port, defaulting to `3001`. Existing listeners are preserved; stop your own server or choose another port. Vite arguments are supported, for example `npm run dev -- --port 5180 --strictPort`.

Set server-only `LLM_PROVIDER`, `LLM_MODEL` and `LLM_API_KEY` for model replies. OpenAI-compatible and Anthropic protocols are supported. Source access also needs its own credentials, configured source scope and database setup; copying the example environment does not grant access. The API starts without a model configured and reports that state. Never put credentials in `VITE_` variables or browser code.

| Command | Purpose |
| --- | --- |
| `npm run dev:api` | API with file watching. |
| `npm run dev:web` | Vite alone. |
| `npm run build` | Build the frontend. |
| `npm run build:api` | Check backend source. |
| `npm run preview` | Preview the built frontend; chat needs a separate API. |
| `npm run start:web` | Run the combined production web/API entrypoint with its required configuration. |

Restart paired `npm run dev` after backend changes. For production authentication, private environment settings and deployment packages, follow the [deployment guide](docs/deployment.md). The shared password gate is live; individual member accounts are still future work.

## Using the site

Click **Ask Tech@NYU** to open Flock, or use **⌘K** on macOS / **Ctrl+K** on other desktop platforms. Enter sends and Shift+Enter adds a line. Escape, the close button or the backdrop dismisses the assistant. Drafts and conversation remain while the page is open, and an active reply continues in the background; **Stop** cancels it. Tool progress and source links appear with the conversation.

Drag to orbit, right-drag or WASD to pan, and scroll to zoom. Touch supports orbit and two-finger pan/pinch. Select a detailed building to focus it; outward scrolling returns to the preceding overview. Typing and scrolling within the assistant stay inside its modal. See [camera and navigation](docs/camera-navigation.md).

## Services, data and privacy

| Railway service | Role |
| --- | --- |
| `web` | Password-gated frontend, conversational assistant and API. |
| `update-agent` | Autonomous planner for queued source updates and bounded Calendar/map reconciliation. |
| `discord-events` | Continuous Gateway ingestion of eligible new messages, edits and deletions, with inherited exclusions. |
| `gmail-events` | Authenticated Gmail callbacks, watch renewal and reconciliation. |

Both agents read Miro through the official live MCP. The former Miro snapshot collector and `miro-sync` service are retired. Discord reads are live, with no durable message archive, stored-summary fallback or vector index. A bounded temporary input cache holds incoming work for the planner. Source allowlists, channel exclusions and current access checks apply independently of the site password.

Planner and chat model calls have **private seven-day audit retention**, including returned outputs, tool outcomes, available token counts and estimated costs. Prompts, uploads, credentials and raw source-tool responses are excluded. Audit logs have no public endpoint or model retrieval tool. Missing usage remains unknown; estimates are not invoices. See [model audit](docs/model-audit.md).

The planner and source tools are live, but upstream quotas, partial reads and tool failures can defer work. A healthy service does not establish a complete synchronization. Consult the milestone snapshot for current operational findings.

## Development guides

- [Assistant/API setup](docs/assistant-backend.md), [deployment](docs/deployment.md) and [database tables](docs/database-tables.md)
- [Discord live access](docs/discord-live-only.md), [Discord operations](docs/discord-launch.md), [Google connector](docs/google-connector.md) and [live Miro MCP](docs/miro-sync.md)
- [Automation](docs/agent-automation.md), [normalized events](docs/events.md) and [map presence](docs/map-presence.md)
- [Tests](tests/info.md), [managed agent workflow](docs/agent-workflow.md), [user notes](notes.md) and [remaining work](milestones/to-do.md)

Core local checks:

```sh
npm run test:assistant
npm run build:api
npm run build
```

The test guide lists focused connector, database and browser checks. Local passing checks do not establish live provider access or successful deployment.

Map/UI code lives in `src/`; backend and collectors in `server/`; callable agent tools in `tools/`; isolated deployment packages in `deployment/`; utilities in `scripts/`. Coordinate shared configuration and milestone journals through one integrator. `evidence/` is local-only and ignored by Git; historical journal links and map comparison/profile scripts may require baselines from the original local workspace. Required automated-test fixtures live under `tests/fixtures/`.

## Map assets and attribution

The scene combines source building tiles, detailed selectable landmarks and offline street/park geometry. Detailed buildings are photo-informed approximations. Preserve placement metadata and licenses when changing assets: [source export](assets/yuyang-site-3d-assets/README.md), [asset manifest](assets/yuyang-site-3d-assets/asset-manifest.json) and [OpenStreetMap attribution](https://www.openstreetmap.org/copyright). Traffic and vehicle animation remain outside scope.
