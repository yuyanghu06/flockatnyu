# Discord live reads and metadata discovery

This folder supports read-only bot retrieval and channel/thread metadata discovery. Message content is fetched live; larger on-demand summaries run only in request memory with bounded evidence and original citations. No historical Discord message archive, durable summaries, vectors or accounting are stored. New native events may remain in the shared temporary pending queue until explicitly processed. Tools do not post messages or join private threads. Credentials remain private server settings.

`live-config.js`, `live-client.js` and `live-retrieval.js` enforce trusted source scope, content capability, enabled catalogue entries, current policy and fresh bot/parent metadata. Unknown or excluded channels and ambiguous ancestry fail closed. Results disclose coverage. Accepted descendant-thread search hits need their own allowed source UUID and ancestry beneath an originally selected channel; final policy/catalogue checks cover every accepted source. A failed/partial read has no stored-summary fallback.

The live summary adapter owns the request-memory summarization path. Its helpers pack bounded inputs, validate original citations and enforce request budgets. These helpers support user-requested live windows only; no periodic content/embedding job remains.

`store.js` supports protected channel configuration, policy and metadata discovery against `discord_view_policies`, the sole Discord table. Its JSONB catalogue retains stable source UUIDs, names/types, eligibility/access metadata and discovery generation/cursors. Discord sources do not duplicate `knowledge_sources`. `discovery.js` resumes bounded metadata pages and reconciles only complete generations; it never stores message bodies.

`cli.js` supports metadata preflight, registration, policy and discovery; explicit one-shot discovery uses `npm run discord:discover`; the redundant generic worker wrapper was removed. Railway now runs `event-cli.js serve` continuously as `discord-events`. Its shared queue holds native creates/edits/deletion payloads until handled; no historical backfill or content archive exists. Applied migrations remain immutable and are never run at startup.

The policy table forces RLS and remains service-only. Assistant reads require backend source allowlists and current bot/policy checks; ingress instead uses the explicitly authorized eligible guild catalogue and inherited blacklist. HTTP administration still requires trusted admin context. No per-person membership tables or source grant expansion follows from collection.

## Event collector

`event-cli.js serve` runs the independently deployed collector. `event-config.js` reads its opt-in switch; `event-listener.js` applies current guild policy, inherited blacklists, bot access and source identity before enqueue. `gateway.js` uses the Gateway-only SDK for heartbeat/reconnect and serializes committed checkpoints; `event-state.js` accesses only metadata CAS RPCs. Shutdown uses a resumable close code. Invalid/expired Discord sessions are disclosed as possible gaps; historical message backfill is never started.

`live-summary-utils.js` holds pure UTF-8 chunking used by the request-memory summarizer. No archive or vector provider remains in production source. Metadata management remains in `cli.js`; hourly/event-triggered metadata refresh in the listener replaces the old daily Railway discovery job. Migration020 records explicit manual disables in existing channel JSONB so discovery cannot re-enable them.

## Chat routing and leadership privacy

`channel-scope.js` maps the verified eboard/team category IDs to default eboard, general fallback and explicit-request team scopes. Live chat reads receive only the current user's text; source text/history cannot authorize teams. Named requests remain scoped, negative/exclusion clauses cannot opt in, and stateless HTTP tools get no team request. Automation retains its independent eligible source scope. Shared live policy excludes leadership-team and all descendants; defaults include its ID. Policy changes require a completed metadata-only discovery refresh before catalogue reads resume.

Shared request-pacing.js serializes bot metadata/content per process and bot/fetch transport, with default750ms spacing,429Retry-After/JSON/headercooldowns and proactive exhausted-bucket waits. Channel summary workers are sequential; request90s/scan120s bounds preserve truthful partials and existing access/content/cost caps. Independent service processes remain separately paced.
