# Discord tools

Live read schemas/validation/dispatch in index.js and request-memory summary adapter in live-summary.js. Bot API, source policy, time context and summarization helpers remain under ../../server/. No archive or ingestion code belongs here.

`read_discord_summary` scans authorized eboard channels first in one bounded live request; general fallback excludes teams and team scope requires explicit current-user intent. The default window spans seven local calendar dates through now. At most30channels and3parallel reads run under45seconds; summaries share the existing12dispatch/0.10USDrequest budget. Per-channel/aggregate coverage, bounded excerpts and missing content remain explicit. An empty authorized catalogue is unavailable, not proof of no messages. No content archive or periodic summary job is introduced.

Shared request-pacing.js serializes bot metadata/content per process and bot/fetch transport, with default750ms spacing,429Retry-After/JSON/headercooldowns and proactive exhausted-bucket waits. Channel summary workers are sequential; request90s/scan120s bounds preserve truthful partials and existing access/content/cost caps. Independent service processes remain separately paced.
