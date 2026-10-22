# Discord live reads, catalogue and pending-event boundary

Assistant content comes from read-only live bot requests: resolve channel names, search messages, read originals or read a requested time window. Larger on-demand summaries stay in request memory with bounded evidence, validated original citations and a spending limit. Unavailable, denied or partial reads disclose their limits. There is no durable Discord archive, stored-summary/vector fallback or scheduled content summarization.

The independent `discord-events` service is active on the Gateway for new messages, edits and deletions. It writes only temporary pending inputs, without historical backfill. Native message-create delivery and durable checkpoints are observed; fixture tests cover edits/deletions, blacklist inheritance and failure/replay handling. Live edit/delete and blacklist probes remain separate operational follow-up.

## Dates and user timezone

The browser sends its current IANA `timeZone` with every chat request. The API validates it and captures one server clock shared by planning, retrieval and answers. “Today”, “yesterday”, “tomorrow” and exact `YYYY-MM-DD` boundaries mean calendar days in that zone. Scans include the start and exclude the end: a whole day ends at the next local calendar date, including daylight-saving changes. The bot receives corresponding UTC instants. Timestamps with `Z` or a numeric offset preserve their exact instant.

`search_discord` and `read_discord_window` accept a timezone override when the user names another zone. Ordinary reads and larger RAM summaries use the same resolver. Coverage reports effective timezone and normalized UTC bounds. Invalid zones/dates and local timestamp arguments without offsets are rejected before bot dispatch. A midnight gap starts at the first valid instant; a fully skipped date is rejected.

Browser detection failure and legacy callers use explicit UTC. Direct tool clients should supply `timeZone` for calendar-date arguments. Timezone is request context, not a source permission or account preference. Metadata/Miro schedules are independent of scan dates.

## Stored metadata and temporary inputs

`discord_view_policies` is the sole Discord-specific table, with one row per server. It stores exclusions/view rules, channel/category/thread metadata with stable source UUIDs, discovery generation/cursors and last completed discovery time. Categories and excluded/unavailable nodes explain ancestry and access decisions. Discord identities do not duplicate `knowledge_sources`.

Migration017 removed the old content, summaries, vectors, accounting and job tables while preserving policy/catalogue identities and unrelated Miro data. Applied migrations/history are immutable. [Archive history](discord-archive.md) links the transitions; [current tables](database-tables.md) describes the separate shared temporary cache and metadata-only automation state.

The authorized listener target uses `agent_input_cache` only for pending events. Successfully processed snapshot IDs are removed by the trusted handler; collection does not itself mean successful processing or invoke an LLM. No persistent event archive or historical catchup follows from this authorization.

## Access and discovery

The backend owns `ASSISTANT_ALLOWED_SOURCE_IDS` (`DEV_ALLOWED_SOURCE_IDS` alias) for explicit non-Discord source grants. Discord source grants are derived from the configured guild’s current published eligible catalogue on authenticated chat/API requests and before each update-agent claim. Newly discovered eligible channels need no environment UUID additions. Live reads still require a registered eligible channel, current exclusions/view policy, content capability, bot permissions and coherent ancestry. Final verification rechecks both policy and catalogue before returning evidence, including discovery changes with the same policy revision. Browser/model arguments cannot expand access or grant administration. Pending-event ingestion has a separate trusted guild scope: all currently eligible channels except blacklisted channels/categories and descendants, with fresh bot permissions and policy/catalogue checks. Assistant processing independently rechecks the current catalogue and live permissions; non-Discord source grants remain explicit. Manual channel disables survive discovery through migration020. Scoped worker claims include only fresh eligible Discord source IDs plus the explicitly authorized Gmail source; old static Discord grants cannot include disabled channels in queue counts or candidates.

Parent-channel searches can return registered child-thread hits. Each accepted thread requires its own allowed source UUID, fresh bot/ancestry checks and the selected parent boundary. Checks are bounded and cached per request; final catalogue validation includes accepted thread sources. Unchecked or incomplete coverage is disclosed.

Metadata discovery uses optimistic generation/state checks. Partial generations cannot publish unverified channels as active; complete generations reconcile disappearance. Changed policy invalidates in-flight work and requires fresh discovery. Service-only RPCs support policy, channel configuration and discovery. RLS denies browser table access, and HTTP administration still requires a backend admin context. There are no per-person membership tables.

The forward035 repair stages pending metadata separately from an explicitly proven completed catalogue. Same-policy refreshes preserve unchanged published sources while observed denials, removals and metadata changes withdraw affected entries and descendants. New sources wait for atomic completion. Existing incomplete generations cannot be treated as a trustworthy previous publication. Source UUIDs and manual-disable intent remain stable. Hosted application20261019193035 and exact function/ACL readback are verified; service-role base-channel recovery and rollback-only refresh continuity are verified in the milestone snapshot. Applied017/020 fixtures retain their historical behavior.

## Current operations and evidence

Current production runs `node server/discord/event-cli.js serve` continuously with no cron. The old service was renamed `discord-events`; the stored-summary service and content workers remain retired. Supported local metadata operations are preflight, registration, policy and discovery. Worker startup never applies SQL.

Metadata refresh is hourly and triggered by relevant channel/thread changes. The listener stores committed sequence/session metadata only after ordered pending inputs reach Supabase. Disconnects use resumable close codes. Discord may invalidate or expire a session; the service discloses a possible gap and never silently starts historical backfill. Restart continuity must be assessed from actual logs, not inferred from a successful deployment.

Independent live-only cutover tests and hosted fingerprints recorded metadata/source/policy/Miro preservation, plus a bounded real-bot original read with citations and no model call. Evidence is under `evidence/m29-discord-live-only/`. Current deployment and listener verification belong in the [milestone snapshot](../milestones/milestone.md); a build/manual run does not prove a natural schedule or persistent event delivery.
