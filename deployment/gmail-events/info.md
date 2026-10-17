# Gmail event collector deployment

This standalone service starts `node server/google/subscription-cli.js serve`.
It runs the authenticated Gmail Pub/Sub callback, mailbox reconciliation and watch
renewal against the shared Supabase cache. It exposes /healthz and
/webhooks/gmail. Exact OIDC audience/invoker identity, source scope and server-only
credentials remain required; packaging does not change runtime enable flags or
authorization. Source bodies go only into the shared input cache. The image does
not run the agent, call a model or send email.

Run `node scripts/prepare-gmail-deploy.mjs` from the checkout and upload only its
printed temporary `directory`. The preparer copies the subscription entrypoint's
static import closure: Google subscription/OAuth/client/config code and the three
shared automation events/store/validation modules. Other source files,
root dependencies, tests, migrations, evidence, assets and secrets are excluded.
Reachable symlinks, dynamic loading and unreviewed dependencies fail closed.
The output has exact-file .dockerignore protection, root Dockerfile/railway.json,
and this service's own reproducible package manifest/lockfile.

Direct dependencies are pinned @hono/node-server 2.1.4,
google-auth-library 11.3.0 and hono 4.13.13. The Node 22 image installs only locked
production dependencies with install scripts disabled, checks selected source
syntax and runs as node. Local preparation requires Node 22.12 or later. The
context config locks /healthz with 60 second timeout, no cron and ON_FAILURE with
three retries. These are reviewed local inputs; the orchestrator deploys and
verifies the service separately.

Existing Railway service gmail-events: 666e8523-9bfb-43ac-90db-2e2c2fbd1512.
Public callback/audience remains
https://gmail-events-production.up.railway.app/webhooks/gmail (port 3002).
Source UUID: 2fa17434-212d-408d-ab20-448f8c2c5907. Topic/subscription use techflock.
Credentials stay in private service variables. Migration 018/019, consent and
watch activation are explicit setup; none run during deployment preparation.
The rolling milestone records actual live revision, ingestion evidence and
watch freshness; this packaging pass makes no cloud changes.

M36 hosted cutover is verified: the separate Discord/Gmail services are running with their isolated images, no cron, /healthz60 and ON_FAILURE3 against the same expected Supabase. Exact revisions and operational limits live in ../../milestones/milestone.md. No model worker or prompt/memory schema was deployed.

Use GMAIL_EVENTS_ENABLED=true for collection. AGENT_AUTOMATION_ENABLED controls only the separate model worker; this collector does not read it.
