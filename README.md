# Tech@NYU campus assistant

A floating club assistant over a detailed 3D map of NYU's Washington Square campus, built with Vite, Three.js and a Hono API. Current implementation, hosted evidence and unfinished work live in the [milestone snapshot](milestones/milestone.md).

## Run locally

Use Node.js 22.12 or newer. Install dependencies, copy `.env.example` to an ignored `.env` if settings are not already present, then run:

```sh
npm ci
npm run dev
```

This starts the API, checks its health, then starts Vite (normally http://127.0.0.1:5173). `PORT` configures the API and local proxy; its default is 3001. Existing listeners are preserved: stop your own API session or choose another `PORT`. Frontend arguments work normally, for example `npm run dev -- --port 5180 --strictPort`.

Set `LLM_PROVIDER`, `LLM_MODEL` and `LLM_API_KEY` on the server for replies. OpenAI-compatible and Anthropic protocols are supported; `.env.example` explains their API roots. An unconfigured API still starts and reports its actual state. Credentials must never use a `VITE_` prefix or enter browser code.

Use `npm run dev:api` for API watch mode and `npm run dev:web` for Vite alone. Paired mode needs a restart after backend edits. `npm run build` and `npm run preview` serve a production frontend; preview needs a separate API for chat. Production member authentication is unfinished, so protected production API routes deny access by default.

## Assistant and map

The campus opens when resources are ready. Click **Ask Tech@NYU** or press **⌘K / Ctrl+K** for the assistant. Enter sends, Shift+Enter adds a line, and Escape or the backdrop closes it. Drafts and completed conversation survive dismissal; closing or Stop cancels an unfinished reply. Original source links accompany retrieved answers. API status reports configuration, not provider health.

Discord questions read messages live through the bot, with explicit denial/coverage limits and no stored-summary fallback. Gmail/Drive tools remain read-only. Independent Discord/Gmail collectors have received real new inputs into the shared temporary cache. See [Google setup](docs/google-connector.md) and [automation](docs/agent-automation.md) for access, processing and missing map/Calendar adapters.

Drag to orbit, right-drag or WASD to pan, and scroll to zoom. Touch supports orbit and two-finger pan/pinch. Select a detailed building to focus it; outward scrolling returns to the preceding overview. While the assistant is open, typing and scrolling stay within its modal. Gould Plaza shares Stern's selection and motion. Legacy building/date controls are hidden in the current map presentation.

## Services and data

The Railway `tech-nyu` production environment has three services sharing Supabase:

| Service | Current role |
| --- | --- |
| `discord-events` | Continuous new/edit/delete Gateway ingestion, metadata-only refresh and inherited blacklist checks; no historical backfill. |
| `gmail-events` | Active authenticated Gmail callback, watch renewal and reconciliation; no LLM processing. |
| `miro-sync` | Provisioned Miro worker, paused with `MIRO_SYNC_ENABLED=false`. |

No LLM service or Calendar/map write adapter is active. The [five database tables](docs/database-tables.md) separate policy/catalogue metadata, Miro records, pending inputs and metadata-only checkpoints. Discord/Gmail are separate running services; Miro sync remains paused. No historical Discord archive, stored summaries or vectors are retained. [Deployment inputs](deployment/info.md) contain isolated runtime dependencies; exact verification and limitations live in the milestone.

The scene uses source building tiles, detailed selectable roots, roads, sidewalks and park geometry. Detailed buildings are photo-informed approximations. Preserve geometry, placement metadata and licenses: [asset export](yuyang-site-3d-assets/README.md), [manifest](yuyang-site-3d-assets/asset-manifest.json), [OpenStreetMap attribution](https://www.openstreetmap.org/copyright). Traffic remains outside scope. Building/day activity views are unfinished, and no sample club events are presented as real information.

## Guides and checks

- [Assistant/API setup](docs/assistant-backend.md) and [backend direction](docs/backend-direction.md)
- [Discord live access](docs/discord-live-only.md) and [operations](docs/discord-launch.md)
- [Miro ingestion and tools](docs/miro-sync.md), [Google connector](docs/google-connector.md) and [automation](docs/agent-automation.md)
- [Camera/navigation](docs/camera-navigation.md), [tests](tests/info.md) and [workflow](docs/agent-workflow.md)

Run `npm run test:assistant`, `npm run build:api` and `npm run build` for core local checks. See the test guide for focused connector and browser commands and their limits.

## Code ownership for parallel work

Map/UI changes belong in src/ and their focused tests; agent/API work belongs in server/ and callable tools/. Source collectors live in server/discord/, server/google/ and server/miro/, with independent deployment/ packages. Development and deployment utilities live in scripts/. Coordinate package.json, shared tests and milestone journals through one integrator. See [tool guide](tools/info.md) and [cleanup handoff](docs/cleanup-handoff.md).
