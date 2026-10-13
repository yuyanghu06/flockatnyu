# Current retention direction (M20)

The user requires per-channel RAG records: raw individual messages for the current
New York Monday–Sunday week, weekly summaries for completed earlier weeks in the
current month, monthly summaries for older calendar months. Preserve current-week
raw across month boundaries. Store channel names alongside IDs. No daily summaries,
proactive briefing or automatic summary prompt injection; images/embeddings off.
Target summary time is08:00 America/New_York on Mondays and the1st. Compacted ranges
prevent re-importing discarded history. Only verified atomic publication removes
replaced content; minimal provenance and original Discord citations remain.
Migrations 001–010 are applied and immutable. The initial frozen bootstrap and
Monday rollover completed on the accepted Railway image. The latest snapshot
has 673 monthly summaries, 49 weekly summaries and four current-week raw messages,
with zero raw before October 12's Monday cutoff. Channel names accompany IDs.
The root-executed read-only storage/permission audit and independent artifact
analysis are accepted (99 tester assertions and evaluator PASS). Daily collection has
executed; Monday/monthstart summary cron is enabled and its effective image
configuration matches, but an actual scheduled summary invocation is unverified.
The rolling milestone records timestamps and evidence.

---

# Discord bot setup, local backfill and Railway handoff

The archive discovers accessible channels and threads using the Discord bot's REST credentials.
Initial collection runs locally and saves resumable checkpoints in Supabase;
the Railway worker continues from that same database. It collects originals and
source links. M18 structured groups classified originals without summarizing them.
M20 replaces older originals with verified weekly/monthly per-channel RAG records,
while preserving the current calendar week. Actual rollout state is recorded in
the milestone. Images are skipped and embeddings remain disabled.

## Create and invite the bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications),
   create an application such as Tech NYU Archive, and open **Bot**.
2. Enable **Message Content Intent**. Verified applications may need Discord's
   approval. The worker checks the application's full/limited Message Content
   capability before archiving.
3. Generate/reset the bot token and save it as `DISCORD_BOT_TOKEN` in this
   checkout's ignored `.env`. Keep the token out of chat and commands.
4. Under **Installation**, enable **Guild Install**, choose the `bot` scope, and
   give it **View Channels** and **Read Message History**. Use the installation
   link and choose the intended server. The installing member needs Manage Server.
5. Check channel permission overrides. Give access only to channels intended
   for this archive. Private threads additionally need bot membership.
6. In Discord's Advanced settings enable **Developer Mode**. Copy the server ID
   into `DISCORD_GUILD_ID` in `.env`. Automatic discovery enrolls accessible
   text channels and threads; explicit IDs are needed only for exclusions or
   deliberately selecting a smaller manual scope.

This collector does not send Discord messages or require a Gateway connection;
its Discord presence may appear offline even when scheduled collection works.
Permission details: [Discord setup](https://docs.discord.com/developers/quick-start/getting-started),
[Message Content](https://docs.discord.com/developers/events/gateway#message-content-intent),
[permissions](https://docs.discord.com/developers/topics/permissions).

## Runtime database credentials

The ignored `.env` has been prepared with the Supabase URL and a provisioned
operator UUID in `DISCORD_OPERATOR_MEMBER_ID`. This operator can configure
channels through the guarded RPC; no archive reader grants were added.
Save the project's legacy server-only `service_role` key in
`SUPABASE_SERVICE_ROLE_KEY`. Developer MCP OAuth is separate from this runtime
key. The current HTTP client uses the legacy JWT key in its apikey and Bearer
headers. Keep it server-side; do not use a VITE_ variable or browser bundle.

The initial two ordered migrations were applied to `tech-visualized`
(`jssehnrmqhstcrtxulpa`) through Supabase MCP. Hosted records are
`20261011200346_knowledge` and `20261011200348_discord_archive`; their bodies
correspond to local `202610120001_knowledge.sql` and
`202610120002_discord_archive.sql`. M18 migration003 was subsequently applied as hosted `20261011205557_discord_discovery_memory`; it adds policy/discovery/time-group storage. Do not replay the local files with `db push`:
their version prefixes differ from MCP's generated history. Reconcile migration
history deliberately before using the CLI for later migrations.

## Initial full-history collection

Once secrets and IDs are configured, use the selected IDs in these commands:

```sh
npm run discord:preflight -- --channel CHANNEL_ID --channel OTHER_CHANNEL_ID
npm run discord:register -- --channel CHANNEL_ID --channel OTHER_CHANNEL_ID
npm run discord:backfill -- --max-runs 100
```

Replace placeholders with exact IDs. Registration defaults each channel's
cutoff to Discord's epoch, January 1, 2015 UTC. This supersedes the earlier
January 2026 cutoff for explicitly registered channels. An optional
`--from TIMESTAMP` sets a narrower cutoff. Re-registering an earlier cutoff
resets its scan state while retaining original rows; avoid changing dates
during an active run.

The preflight validates token/application, content access, guild, channel
permissions/history, and database RPC availability. Registration separately
checks provisioned admin membership and validates all channels before writes.
If a later database operation fails, partial registration is reported.

Backfill repeats bounded jobs, keeps a fixed target time, and proves progress
from stored cursors/watermarks. It stops on errors, cancellation, a stall or the
run limit. `complete: false` requires resuming the command. Run it again before
handoff to catch up messages posted during the initial collection. Check
per-channel counts, earliest/latest dates and successful watermarks in Supabase;
completion covers the selected channels and target time only. Deleted or
inaccessible messages and attachment bytes are not recoverable by this archive.
Historical edits/deletions outside the recent overlap are not fully reconciled.

## Railway service

The new service is [discord-archive in tech-nyu](https://railway.com/project/f13799d2-95ff-4d22-9b17-acfce19406ca).
Its production environment is `dfe169c1-46a0-415a-9171-309fc9974ef8` and service
ID is `2dad5e78-ff4f-4342-acc3-bf3daba2f3f3`. Dockerfile/start/restart settings and
non-secret variables are provisioned. M18 established a baseline of 108,836 raw
originals. The updated collector completed ready/exit zero across 216 sources,
and its daily cron also refreshed all watermarks to 2026-10-12T06:26:52.992Z.
Compaction has since replaced older originals; consult the milestone for current
raw/summary counts. Daily cron `15 6 * * *` remains enabled. Successful one-shot
jobs exit and stop normally; an offline Discord presence is expected.

After local backfill, securely provision `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`
and `SUPABASE_SERVICE_ROLE_KEY` into that exact service's variables. Keep
`EMBEDDING_ENABLED=false` until a model/provider and its credentials are chosen.
Never print variable values or copy `.env` into a deploy context.

Run `npm run deploy:discord:prepare` to get a fresh temporary directory. Deploy
that printed directory with Railway's `--path-as-root` option and exact project,
environment and service selectors. The allowlisted payload includes production
package/backend inputs and a dedicated Dockerfile. It excludes `.env`, the map,
test evidence and the API's existing `railway.json`.

Start: `node server/discord/cli.js sync`. No HTTP healthcheck, public domain or
restart loop. Verify the build, sanitized job result and database watermark
before enabling daily cron `15 6 * * *` (06:15 UTC, 01:15/02:15 New York).
An unconfigured or partial strict run exits nonzero and retains its durable
progress. The next scheduled run can resume it. A previous still-running job
suppresses the next Railway invocation. See [Railway cron](https://docs.railway.com/cron-jobs).


## Automatic discovery and exclusions (M18)

New service-only policy commands configure category/channel exclusions and a
pause switch. Exclusions inherit through category → channel → thread. Sources
have independent access grants; discovery adds no readers. No thread joining,
Discord message sending, image downloads, embeddings or model calls occur.

```sh
npm run discord:policy -- --paused true --exclude-category CATEGORY_ID --exclude-channel CHANNEL_ID
npm run discord:discover
npm run discord:reset
npm run discord:policy -- --paused false
npm run discord:discover
npm run discord:backfill -- --max-runs 100
npm run discord:classify
```

Policy edits require the provisioned operator. Omitted exclusion flags preserve
existing lists. Explicit discovery can stage metadata while paused; message
collection and retrieval remain blocked. Reset requires a paused policy and
clears only that guild's Discord originals, revisions, groups and scan progress,
including Discord-derived generic knowledge records. It preserves operators,
policy, exclusions, source configuration/grants and non-Discord sources.

Discovery checkpoints survive a budget cap. Repeat `discord:discover` until
complete; an incomplete generation does not remove unseen existing sources.
Scheduled sync performs discovery before history scans, so new channels/threads
are enrolled without manual IDs. Public archives and joined private archives
are inspected; all private archives require existing moderation permissions.
Threads are not joined automatically. Voice/stage channels are excluded from
this text-channel collector.

Every collection page checks the stored policy revision. A concurrent pause,
blacklist or reset rejects an old page. Images and their embedded metadata are
removed, while text, source links and ordinary file links remain. The historical M18 groups used rolling168-hour precedence without deleting
originals. M20 supersedes that retention rule with current Monday–Sunday raw,
completed current-month weekly summaries and older monthly summaries. Source
classification remains atomic and bounded; summaries require separate verified
publication before consumed originals are removed.

M18 scoped reset cleared only the initial guild archive while preserving configuration, operator and grants. Four category exclusions and one channel exclusion are active. Complete metadata discovery recorded266 nodes and216 eligible sources. The first hosted run aborted at its240-second discovery deadline; the same image resumed successfully with a900000ms discovery budget. The separate history budget is also900000ms. Consult milestones/milestone.md for current counts and final independent review.

## Weekly/monthly retention (M20)

No daily summaries. Mondays at08:00 New York compact completed earlier weeks of
the current month into one summary per channel/week. On the1st08:00 compact the
previous month up to the current week's Monday boundary. A later Monday completes
a prior month's remaining tail without deleting current-week originals early.
Initial bootstrap handles older months directly, then completed current-month
weeks. Names and IDs identify channels; summaries exist purely as RAG records.

Use exactly `LLM_PROVIDER=openai-compatible`, `LLM_MODEL=gpt-6-luna`, the OpenAI API
root and server-only `LLM_API_KEY`. Operator commands are:

```sh
npm run discord:summaries:preview -- --mode bootstrap
npm run discord:summaries:bootstrap -- --max-runs 100
npm run discord:summaries:weekly
npm run discord:summaries:monthly
npm run worker:summaries
```

`--operation UUID` resumes a fixed operation. Manual commands accept a strictly
validated ISO `--as-of`; scheduled work freezes the08:00 local snapshot even if
startup is delayed during the 08:00 hour. Defaults: four concurrent jobs,25 groups/100 requests/10minutes
per bounded pass, a$1 pass cap and$5 durable operation cap. Bootstrap and scheduled
commands continue the same operation for at most100 passes; failures retain saved
progress. Each model attempt reserves cost before dispatch. Known usage releases
unused headroom; uncertain charges retain the conservative reservation.

Raw and verified weekly-summary inputs have separate processed and represented
counts. Complete segment/DAG coverage, source permissions, current dependency
fingerprints and the lease must pass before a single database transaction publishes
the replacement certificate/ledger and removes consumed raw, revisions, temporary
parts/inputs and replaced weekly content. Failures leave source content intact.
No hidden full-original archive is retained. Final citations point to original
Discord IDs/URLs; monthly lineage distinguishes prior summaries from directly
read originals. Local verbatim retrieval is unavailable after compaction.

Compacted ranges prevent old backfills or daily overlap from restoring discarded
raw. A new source has no range ledger and first completes its ordinary history
collection. Incomplete source histories return `wait_for_sync`, with no generation
or deletion. Reader access remains current-policy/source/grant scoped; no readers
are automatically granted. Images, embeddings, tools and linked-document fetching
remain disabled.

The separate summary service uses cron `0 12,13 1 * 1`: Monday OR the1st, at both
possible UTC offsets. Its scheduled entrypoint gates08:00 America/New_York, so one
slot generates and the other only resumes unfinished work or exits `not_due`.
Monthly closure takes priority on Monday the1st. Daily archive collection remains
independent at06:15UTC, so model outages cannot stop original collection.

Migrations 001–010 and actual model generation, atomic pruning and manual cloud
execution are accepted. Do not replay applied migrations. Terminal storage/permissions verification and independent artifact analysis
passed; actual scheduled
summary execution is unverified. Member authentication, production RAG wiring and
embedding provider selection remain future work.

Developer MCP now requires reauthentication; the already-authenticated CLI and
server runtime connection work. The terminal SQL ran under SET TRANSACTION READ
ONLY; the guarded reader was tested separately through its existing runtime API.
No grants, credentials or schema changed during the audit. Reports attribute
root execution separately from independent tester/evaluator analysis.
