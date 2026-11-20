# Discord event collector deployment

This service image starts `node server/discord/event-cli.js serve` and runs the
live Discord Gateway collector. The collector uses the existing bot and shared
Supabase cache; source authorization and exclusions remain runtime requirements.
The management CLI remains a separate local tool. The previous daily metadata
job is superseded by the continuous collector; there is no archival or summary
worker in this image.

Run `node scripts/prepare-discord-deploy.mjs` from the checkout. Upload only the
fresh temporary directory printed as `directory`. The preparer parses the
entrypoint's transitive static ES module imports without executing them, copies
only reachable modules under server/discord, server/automation, server/marketing,
server/google and server/map (plus reviewed shared modules), and rejects
symbolic links, dynamic loading, cross-service imports and unreviewed packages.
It copies this folder's independent manifest/lock, Dockerfile and railway.json to
the context root. Its exact-file .dockerignore excludes later accidental files.
No root dependency manifests, tests, archived workers, environment files, Miro
or model-provider modules belong in the context. Since 2026-11-19 the marketing
slash commands read the club Calendar here, so the Google Calendar client (and
the three map validation modules it imports) are packaged deliberately.

The only direct npm dependencies are pinned @discordjs/rest 2.6.3,
@discordjs/ws 2.0.4 and google-auth-library 11.3.0 (the same version and lock
entries as the gmail-events worker). The lockfile records their transitive runtime dependencies.
The Docker build uses npm ci with install scripts disabled, syntax checks the
selected source and runs as the node user. No credentials or schema migration
are part of build/startup. Static-import parsing uses a separate native Node VM
parser process; Node 22.12 or later is required for local preparation.

The context-root railway.json sets the exact serve command, /healthz with a
60 second startup timeout, no cron, ON_FAILURE and three retries. This replaces
old daily 10:00 UTC/NEVER settings only when the orchestrator deploys and verifies
the configuration. Existing service: 2dad5e78-ff4f-4342-acc3-bf3daba2f3f3 in Tech NYU
production. This packaging pass performs no cloud writes; the rolling milestone
records actual deployment and listener acceptance.

M36 hosted cutover is verified: the separate Discord/Gmail services are running with their isolated images, no cron, /healthz60 and ON_FAILURE3 against the same expected Supabase. Exact revisions and operational limits live in ../../milestones/milestone.md. No model worker or prompt/memory schema was deployed.

The reachable metadata-refresh.js helper resumes incomplete guarded discovery generations promptly; sanitized packaging includes it explicitly. Startup inspects the checkpoint to avoid unnecessary fresh scans when the catalogue is already complete. Existing complete-generation authorization and exclusions remain mandatory.

Docker copies the whole sanitized server tree from the generated context, including reviewed shared root modules, rather than omitting modules outside the service subfolder. The static packager still controls exact inclusion.

## Marketing slash commands (not yet enabled)

`MARKETING_INTERACTIONS_ENABLED=true` turns on the marketing interaction
dispatcher (see `server/marketing/info.md`). Without it the service behaves as
before. Enabling it also requires these private variables on this service:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
`GOOGLE_EXPECTED_ACCOUNT_EMAIL` and `GOOGLE_CALENDAR_ID` (the same Tech@NYU
values the web service uses), the allowed roles and channels below,
migrations 057 and 058 applied, and the commands
registered with `npm run marketing:register -- event-info event-details`. None
of this has been deployed.

Who may use the commands is set only by these comma-separated variables; unset
means nobody. Production values (non-secret Tech@NYU IDs supplied by the user on
2026-11-19):

- `MARKETING_ALLOWED_ROLE_IDS=1203562091517321226,1203562091517321229,1203562091517321230`
  (events leads, marketing, leadership)
- `MARKETING_ALLOWED_CHANNEL_IDS=1203562092213305370,1203562092213305366`
  (#events-team, #marketing-and-content-team)

For testing, set them to a test role and channel (for example the Eng Leads role
and #flock-test) instead; no code change is needed.
