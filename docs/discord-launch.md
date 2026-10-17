# Discord live access and metadata operations

The bot supports live assistant reads and an independent Gateway collector. Railway `discord-events` runs `node server/discord/event-cli.js serve` continuously with no cron; native new messages have reached the shared pending queue. No historical message backfill, durable archive, stored-summary job or vector worker exists. See [live-only reads and pending inputs](discord-live-only.md).

## Active event collector

The daily metadata job has been replaced by the independently deployed event collector. It receives new/edit/delete events from eligible guild channels except blacklisted channels/categories and their threads, preserving manual disables. Assistant read allowlists remain independent. Partial edit/deletion payloads stay native and are not hydrated from historical messages.

## Configuration

Keep `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in ignored local settings or the exact service's private variables. Administrative CLI operations use the configured trusted operator. Developer MCP OAuth does not provide runtime database credentials. Never expose credentials through `VITE_`, logs, deploy files or browser code.

The bot must already belong to the intended server, with Message Content capability and only the required View Channel/Read Message History permissions. Private threads need existing access. These REST tools do not join threads or post messages; an offline bot presence does not establish a job failure.

Assistant live reads additionally require server-owned `ASSISTANT_ALLOWED_SOURCE_IDS` (`DEV_ALLOWED_SOURCE_IDS` alias), live-read enablement and eligible catalogue entries. Local development requires the explicit local live-read switch. Discovery creates no read grants and cannot expand backend source scope. HTTP administrative routes still require backend administrator authorization.

## Supported operations

```sh
npm run discord:preflight -- --channel CHANNEL_ID
npm run discord:register -- --channel CHANNEL_ID
npm run discord:policy -- --paused true --exclude-category CATEGORY_ID --exclude-channel CHANNEL_ID
npm run discord:discover
```

Use exact approved IDs. Preflight may read a bounded original to verify bot access; it does not persist message content. Registration configures channel metadata only. Policy changes preserve omitted exclusion lists; pause/exclusion changes can invalidate reads and require fresh discovery. Commands mutate configuration only when explicitly invoked by an authorized operator; listing them here is not an instruction to run them against production.

Discovery resumes bounded metadata pages using stored generation/cursor state. An incomplete generation does not publish unverified channels as active or remove unseen entries. A complete generation reconciles disappeared channels. Exclusions inherit through category, channel and thread; ambiguous ancestry fails closed. Repeat an incomplete discovery with the same approved configuration. No content scan or historical backfill follows it.

## Independent deployment

[Discord deployment inputs](../deployment/discord-worker/info.md) include only the collector import closure and pinned Gateway SDK dependencies. Gmail and Miro have separate images; no map, LLM, historical fixture or credential file enters this context. Runtime uses server-only secrets and shared Supabase. `/healthz`, ON_FAILURE3 and no cron are explicitly verified on the active service.

The `tech-nyu` production environment also contains active `gmail-events` and paused `miro-sync`. Their runtime credentials and entrypoints belong to their own deployment guides. A Discord change must preserve them. No deployment or external configuration change is implied by editing these docs.

Applied SQL/history is immutable. Hosted/local migration prefixes differ; consult [migration guidance](../supabase/migrations/info.md) before deliberate schema work, and never replay the directory with ordinary `db push`. Current deployment evidence, last observations and open checks belong in the [milestone snapshot](../milestones/milestone.md).
