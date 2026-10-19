# Discord conversations

Flockbot responds automatically to explicit bot mentions and replies to its own messages in the currently enabled, nonblacklisted eboard channels and eligible descendant threads. Ordinary messages, other guilds, DMs, bot/webhook authors and blacklisted leadership channels do not trigger chat. Implementation is independent of Morpheus source code; no archive or index is added.

## Shared assistant and caller identity

`server/chat-runner.js` executes the same retrieval/answer/provider/audit lifecycle for website and Discord. The website retains its existing body validation, password authentication and NDJSON protocol. `chat-request-context.js` validates server-only Discord context containing the original request ID, guild/channel/thread, stable Discord user ID, username and server display name. Both planning and answer prompts receive it as data. Names do not grant source access, establish a linked roster identity or authorize actions. Browser-supplied identity context is ignored.

The web service resolves current member details independently before inference. It computes current member View Channel, Read Message History and send permissions with guild roles/overwrites, pending/timeout checks and private-thread membership. Owner/admin and manage-thread permissions follow Discord semantics. Current eligibility is checked again before a generated response leaves the service.

## Automatic context

Every accepted Discord request automatically loads original message text from the invoking channel or thread for the exact hour before the triggering Discord snowflake timestamp. It follows the existing live-window pagination, keeps whole records with author IDs/names and UTC timestamps in chronological order, and excludes the triggering message already present as the current request. It does not sweep other channels or include a parent channel when invoked in a thread.

The server also reads the existing Supabase `map_people` directory, selecting exactly `discord_user_id,display_name` for nonnull Discord IDs. The model receives only Discord ID/name pairs plus completeness metadata, without emails, avatars, profile UUIDs or activity data. Duplicate conflicting IDs are omitted. Both automatic contexts reach planning and answering, remain separate from the verified current actor, and cannot authorize actions or source access. Their raw data is absent from audit events and NDJSON metadata; browser bodies cannot supply them.

Recent text is capped at 2000 messages / 120000 characters and 4000 characters per complete record, with a 45-second loading budget. Directory context is capped at 1000 mappings. Missing pages, budget limits, non-text messages or source failures are explicitly marked incomplete; the assistant must disclose that limit rather than claim to have read everything. Attachments and embeds are not fetched. No message archive or directory copy is persisted. The overall bridge request deadline is 180 seconds by default, covering loading, model work and final access checks.

## Source and audience boundary

The initial Discord runner exposes only live Discord read/summary tools. It omits the website's shared memory, Gmail/Drive, Miro, map and Calendar tools. These omissions keep source material from a broader website conversation out of channel replies. Extending this profile is a separate source/audience decision.

`chat-access.js` intersects the server source UUID allowlist with the currently enabled eboard catalogue and current exclusion/ancestry policy. The invoking destination must be registered and eligible; a disabled parent cannot be bypassed through a thread. Other source channels/public threads must have equivalent View Channel and Read Message History overwrite rules to the destination; privately restricted threads are available only as their own destination. Missing permission metadata narrows to the invoking channel and eligible parent. All source tools retain their own final policy checks. Source mapping/names/ancestry and policy changes invalidate transient conversation profiles.

## Services and configuration

The existing `discord-events` service owns the only Gateway connection. A bounded, detached chat hook handles native message events; model latency does not delay pending-input ingestion/checkpoints. Chat-generated create/update messages are excluded from autonomous input collection while chat is active. Other collector behavior is preserved.

The collector calls the web service's `/internal/discord/authorize` and `/internal/discord/chat` endpoints. They require a separate private bearer secret, reject browser Origin headers, and cannot be authorized by the site password/cookie. Body-supplied principals/actor labels are rejected; the web service constructs them. No secret belongs in browser variables, committed files or model context.

Set private Railway variables on both web and discord-events:

- `DISCORD_CHAT_ENABLED=true`
- `DISCORD_CHAT_BRIDGE_SECRET`: the same private random value of at least 32 characters.

On discord-events additionally set `DISCORD_CHAT_API_ORIGIN` to the protected web origin, such as `https://flock.techatnyu.org`. Existing bot, guild, shared-source and service settings remain authoritative. Chat defaults disabled. The web service needs its existing Discord read configuration and source allowlist; enabling chat does not expand them.

No slash command is registered or handled. A normal `@Flockbot` mention invokes the assistant automatically; a bare mention uses the recent conversation as its question context. Existing unrelated application commands remain untouched. Bot send/thread permissions must exist.

## Limits, history and failures

Default limits are 3 concurrent transport requests, 1 per member and 20 requests/member/hour. Slots are reserved before authorization or other network work; overload returns without further allocation. Mentions show bounded typing pulses. Requests allow 8000 characters, and generated output is capped at 8000 then split into at most 2000-character messages. Every delivery suppresses automatic mentions and preserves the actual channel/thread. Missing reply targets do not fall back to channel announcements.

Histories are RAM-only, expire after 30 minutes, and are isolated by member, destination/thread and current source profile. Default maximum 100 histories; conversation count/characters/UTF8 bytes retain the shared API bounds. No tool-result history is retained. Default deduplication lasts 1 hour with 2000 entries; active requests also remain deduplicated independently of cache eviction. Histories and replay protection reset on process restart. Automatic source contexts are rebuilt for every request and are not stored in conversation history. There is no durable job queue or guaranteed exactly-once delivery across crashes. Partial or ambiguous sends are not automatically replayed. Website and Discord histories remain separate.

Private seven-day model audit still records returned model text/usage and content-free run/tool outcomes; it never records request prompts, actor-context objects, interaction tokens or raw tool responses. Existing source retention rules remain unchanged.

## Verification

Synthetic tests cover shared execution, actor spoofing, access/ACL/blacklists/threads, source-profile changes, private bridge authentication, rate/admission/dedup/history bounds, cancellation, safe delivery, ignored slash interactions and nonblocking Gateway behavior. Source and deployment checks are distinct from a real member invocation. Actual rollout and live acceptance belong in `milestones/milestone.md`.
