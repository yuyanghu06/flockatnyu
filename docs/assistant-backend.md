# Assistant/backend development snapshot

Status: incomplete; development stopped for a user-requested dev-branch snapshot. No deployment, live connector, database migration or paid model call was performed.

## Implemented source

- Assistant panel and launcher appear after explicit campus entry, with selected-building context, streamed text, cancellation, safe links and honest configuration/error states.
- Hono exposes health, status and chat routes. Adapters implement OpenAI-compatible and Anthropic streaming protocols, timeouts, cancellation and sanitized errors. Model/provider settings and credentials remain server-side.
- Development access requires loopback checks. Production protected routes fail closed until real member authentication is implemented.
- Knowledge repository and local SQL provide permission-scoped storage/search, originals, links, timestamps, source/document grants, summaries and sync state. Seven tables are protected; embeddings reserve 1,536 dimensions without a selected model/provider or generated vectors. Current retrieval is text search.
- Daily worker is a truthful no-op without connector adapters. No scheduler is activated. Discord/Drive adapters remain future work; Luma/Miro are deferred.
- Vite proxies `/api` to the local backend; Railway configuration describes a future API service, not an actual deployment.

## Setup boundary

`.env.example` documents server-only variables. Copy it to ignored `.env` locally; never use `VITE_` prefixes for credentials. A model name, provider and key must be explicitly configured for real model calls. Database runtime credentials are separate from MCP OAuth; source IDs and database grants must both permit access.

After package installation is available, `npm install` must resolve Hono dependencies and refresh `package-lock.json`. The current lock is stale; `npm ci` and deployment are not validated. `npm run dev:api` starts the API on loopback port 3001; `npm run dev` starts Vite separately. `npm run build:api` checks syntax and real imports. `npm run test:assistant` runs fixture tests. `npm run worker:daily` currently reports no-op status. These commands are documented, not a claim that unavailable dependencies were installed.

## Verification and open issues

Latest targeted run: 32 tests passed, one Hono integration test explicitly skipped, zero failures. Fixture coverage includes provider protocols, split UTF-8, cancellation/errors, safe frontend rendering, scoped repository behavior and SQL source contracts. SQL checks do not execute PostgreSQL. Hono was unavailable after registry DNS failures.

Review found two unresolved issues: chat history can exceed the server's 16,000-character and 32,768-byte budgets, causing HTTP 400 until cleared; chat questions over 500 characters are accepted by chat but rejected by retrieval. Align these limits and add regression coverage in a future development pass.

Production authentication, connector adapters, scheduler activation, live provider/database tests and real browser integration remain unfinished. Previous frontend build was blocked by asset realpath permission; no production build success is claimed. Supabase registration was observed, but authentication status was unknown, no database response was obtained and the migration remains unapplied. See [schema guide](../supabase/info.md) and the inventory in AGENTS.md.
