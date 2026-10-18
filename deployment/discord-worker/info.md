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
only reachable modules under server/discord and server/automation, and rejects
symbolic links, dynamic loading, cross-service imports and unreviewed packages.
It copies this folder's independent manifest/lock, Dockerfile and railway.json to
the context root. Its exact-file .dockerignore excludes later accidental files.
No root dependency manifests, tests, archived workers, environment files, map,
Google, Miro or model-provider modules belong in the context.

The only direct npm dependencies are pinned @discordjs/rest 2.6.3 and
@discordjs/ws 2.0.4. The lockfile records their transitive runtime dependencies.
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
