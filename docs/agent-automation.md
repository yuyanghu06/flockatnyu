# Cache-driven agent and Gmail events

## Local implementation and boundaries

Migration018 creates `public.agent_input_cache(uuid, raw_response)` only. The raw
JSON can represent Discord, email or other provider events. Migration019 adds a
separate service-only metadata table for queue identities, leases, cooldowns,
successful-action receipts and mailbox checkpoints. Source bodies remain in the
cache. Hosted018/019 are verified at versions20261017182014 and20261017182143.
001–017 stay immutable and must not be replayed with ordinary db push.019
committed despite an API400; its missing history receipt was restored only after
independent exact-schema verification. Prior tables/data/functions are preserved.

The source updater is `createEventUpdater` in server/automation/events.js. It
stamps receipt time, requires a backend-owned source authorizer, derives a stable
UUID from source/event/revision identity and atomically deduplicates enqueue.
New revisions are new immutable entries. It does not install a Discord Gateway
listener. Existing Discord live-only read tools and policy enforcement are intact.

`createAutomationHandler` in server/automation/handler.js claims a bounded batch,
builds the sample prompt, executes registered tools and deletes only explicitly
finished snapshot UUIDs. Empty, young, cooldown and busy queues make no model
request. The default trigger is five pending updates OR oldest age five minutes,
a one-minute cooldown and one active leased run. `serve` checks every five seconds;
this is a persistent worker, not a five-minute cron. Collection does not use an LLM.

`server/automation/prompt.js` is the initial sample prompt for later collaborative
tuning. It treats source text as evidence, focuses on stated location plans/help
responsibilities, preserves identities/time/provenance and defers unsupported work.
No RSVP inference or claim of verified physical location is introduced.

## Tools and running the agent

Use the existing server-only LLM settings and opt-in environment variables in
.env.example. A trusted local `.js`/`.mjs` module selected by
`AGENT_AUTOMATION_ADAPTER_MODULE` exports
`createAutomationAdapters({env,config,store,provider})`, returning a server-owned
principal, current source-policy authorizer and tools. Each tool supplies name,
description, an argument schema and its actual executor. See
[the module guide](../server/automation/info.md) for exact contracts.

The app currently has no map/Calendar write adapter. Missing adapters fail
`not_configured`; the worker does not fabricate successful updates or clear
unsupported inputs. Source IDs in cache JSON never grant access. Authorizers
must recheck current allowlists/provider policy. Keep credentials in ignored
environment files or service secrets, never in adapter output or source payloads.

```
npm run agent:tick
npm run worker:agent
npm run test:agent-automation
```

Only successful actions followed by explicit `finish_batch` permit exact cleanup.
Tool adapters must support the provided stable idempotency key and reconcile an
ambiguous remote outcome. Source/context reads should be refreshed on retries.
Source bodies and tool result bodies are not copied into receipt metadata. Pending
inputs survive errors, unknown tools, incomplete model turns and exhausted bounds.
Metadata receipts currently have no automatic retention job; no extra source
content archive or embeddings are created.

## Gmail subscriptions for techflock

The standalone Gmail service exposes `/healthz` and authenticated
`POST /webhooks/gmail`. It verifies Google's OIDC signature and exact
invoker/audience before accepting notifications, then reads Gmail history and full
bounded message JSON into the shared cache. Mailbox cursor/lease/watch metadata
uses subscription-prefixed state. The initial watch begins at its returned
baseline; it does not import earlier mailbox history. Source scope is explicit.

Set these non-secret configuration fields alongside existing Google/Supabase
server credentials:

- `GOOGLE_PUBSUB_PROJECT_ID=techflock`
- `GOOGLE_PUBSUB_TOPIC=projects/techflock/topics/tech-nyu-gmail-events`
- `GOOGLE_PUBSUB_SUBSCRIPTION=projects/techflock/subscriptions/tech-nyu-gmail-push`
- `GOOGLE_PUBSUB_AUDIENCE`: exact public HTTPS webhook URL/audience.
- `GOOGLE_PUBSUB_PUSH_SERVICE_ACCOUNT`: exact configured push identity.
- `AGENT_GMAIL_SOURCE_ID`: stable UUID explicitly included in the shared source allowlist.
- `GMAIL_EVENTS_ENABLED=true`, only after setup and policy are ready; independent of the agent switch.

A project administrator must enable Pub/Sub/Gmail APIs, prepare the topic and
allow `gmail-api-push@system.gserviceaccount.com` to publish to that topic. Configure
an authenticated push subscription for the public callback, matching its exact
OIDC audience and service-account identity. The Pub/Sub service agent needs token
minting permission on that push service account; grant only the required scope.
The deployment image is deployment/gmail-events/Dockerfile. No cloud resources
are created by adding these files.

```
npm run gmail:status
npm run worker:gmail
npm run gmail:watch
npm run gmail:sync
```

The server's serialized reconciliation loop checks every five minutes and renews
the Gmail watch daily. It preserves pagination/cursors and bounded fingerprint/offset progress within
large pages on failures and restarts. An expired
history cursor returns `resync_required`. Oversized full messages fall back to raw
metadata with event type `email_received_metadata`, requiring an authorized body
read before body-based actions. Failed metadata fallback or deleted-before-fetch
mail retains the cursor for retry/operator resolution. The original
headers and MIME parts remain raw JSON; decoded-text interpretation belongs in
the later prompt/context adapter. The service adds no mail sends, mark-read,
Drive modifications or Calendar writes.

Operational status on2026-10-17: the user-enabled Tech@NYU Chrome profile
confirmed successful techflock topic, scoped IAM and authenticated subscription
creation. Hosted018/019 and exact receipts are independently verified. Railway
service gmail-events is live on revision79247d6f-c10f-4642-9371-540a3cee14d9:
health200, unsigned/forged notifications401, real signed Pub/Sub callback200.
The Gmail watch is active, expiring2026-10-24T18:23:50.852Z, with daily renewal
and five-minute reconciliation. Source UUID:2fa17434-212d-408d-ab20-448f8c2c5907.
Callback: https://gmail-events-production.up.railway.app/webhooks/gmail.
The user’s test message was received as one full email_received cache entry at
2026-10-17T18:34:20.688488Z with the correct source UUID. The mailbox checkpoint
advanced successfully and is ready without an active lease. No message body or
sender details were copied into verification logs.

Initial live notifications failed at a non-string historyId. The final handler
supports exact positive safe-integer numeric wake-up IDs alongside lossless string
IDs; unsafe numbers remain rejected and trusted Gmail history responses alone
advance the cursor. Canonical Base64 and Base64URL notifications are accepted.
Fixed-reason/type diagnostics exclude content, headers, identities and tokens.
Final local integration113/113 passes; independent focused41/41 and review pass.
No LLM worker is active; collection does not execute map/Calendar tools. Concrete
trusted adapters and collaborative prompt tuning remain follow-up work.

References: [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push),
[Gmail history synchronization](https://developers.google.com/workspace/gmail/api/guides/sync),
[authenticated Pub/Sub delivery](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions).

## M36 collector deployment update

Discord and Gmail are independently deployed thin ingestion services sharing the pending cache and metadata state. Native Discord creates and a real Gmail email have been observed in the queue. Discord ingress uses the eligible guild catalogue except inherited blacklists/manual disables, independently of assistant read scopes. Its startup never backfills message history. Collection does not invoke the inactive agent. Migration020 (hosted20261017184647) only preserves manual channel-disable intent in existing JSONB; no prompt/memory table was added.

Implemented: callable tools grouped by capability under tools/, development utilities under scripts/, and independent Gmail/Discord ingestion switches. GMAIL_EVENTS_ENABLED controls Gmail collection; AGENT_AUTOMATION_ENABLED controls model processing.

Still planned: independently deployed interactive chat and scheduled automation processes sharing tool code; agent-owned short/long-term context through update_memory, with core instructions operator-controlled. No memory migration or memory tool has been implemented.
