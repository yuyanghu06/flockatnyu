# Railway website and autonomous services

The production web service serves the built frontend and chat API on one HTTPS
origin. Discord/Gmail collectors and update-agent are independent services sharing
the existing Supabase project. Migrations are never applied at image startup.
The user authorized this live rollout and autonomous activation on2026-10-18.

## Access

Set `SITE_ACCESS_PASSWORD` (at least12characters), `SITE_SESSION_SECRET` (at least
32characters), and exact HTTPS `PUBLIC_ORIGIN` in private Railway web variables.
No password is checked into code or written to a local deployment credential file.
The shared operator session is nonadmin and gets only server-configured source
scope. `SITE_GOOGLE_ENABLED` and `SITE_DISCORD_ENABLED` explicitly enable those
capabilities. Browser sessions use signed Secure/HttpOnly/SameSite cookies,
persist across browser restarts for30days by default, and require the configured origin for mutations.
`SITE_SESSION_TTL_SECONDS` can shorten that lifetime (300–2592000seconds).
Both the signed token expiry and cookie Max-Age enforce the configured duration;
logout immediately clears the browser cookie. Cookies remain specific to the
browser profile and site hostname; private browsing and clearing cookies remove them.
For a custom domain, add its exact HTTPS origin to web-only
`SITE_ALLOWED_ORIGINS` (comma-separated) and redeploy web. `PUBLIC_ORIGIN` stays
accepted automatically. Keep it stable on web and worker because existing
chat-attendance citations use that origin; login aliases preserve those records.
Aliases never accept wildcards, HTTP, credentials, paths, query strings or fragments.
Cookies remain host-only, so each domain requires its own login.
Rotate `SITE_SESSION_SECRET` to revoke all issued sessions; changing the password
alone changes future sign-ins. Logout clears the current browser cookie.

All pages/assets/APIs require login except the login page, minimal `/healthz`,
and exact read-only `/favicon.svg` and `/favicon.ico` branding paths.
The exact `/internal/miro/token` route requires its separate server bearer secret;
a browser session never authorizes it. Backend admin policy routes remain denied.

## Packages and secrets

Build with `npm run build` and `npm run build:api`. Prepare new temporary contexts
with `npm run deploy:web:prepare`, `npm run deploy:agent:prepare`, and the existing
Discord/Gmail preparers. Upload only the returned directories using Railway CLI
with explicit project, environment and service. Contexts contain reachable source,
pinned production dependencies and approved built assets; no repository `.env`,
OAuth files, evidence, Git history or unrelated tools are uploaded.

Configure source/model/Supabase credentials through private variables. Do not
print variable-list JSON or place values in command arguments/history. Keep
`AGENT_AUTOMATION_ADAPTER_MODULE` unset; only the reviewed default adapter ships.
Web has automation disabled; only update-agent runs `serve` with activation true.

## Miro OAuth ownership

Web owns the sole refreshing application OAuth session at
`/data/miro-auth.json` on its persistent volume. Provision the existing private
session separately from the build, then restart web. The startup entrypoint
validates the exact directory/file, rejects symlinks, sets only those paths to
UID/GID1000 and modes0700/0600, and drops privileges before starting Node.
The worker has no refresh credentials, client secret or auth-file setting. It uses
`MIRO_MCP_TOKEN_BROKER_URL` and shared `MIRO_TOKEN_BROKER_SECRET` to obtain short-lived
access tokens, then reads the official Miro MCP directly. Refreshes are serialized
and rotated tokens persist. Both agents retain existing read-only Miro tools.

Stop the local API before transferring that OAuth session. Local filesystem locks
cannot coordinate independent copies; do not refresh the old local file after
transfer. Unit fixtures do not use real credentials.

## Activation and checks

Collectors retain their independent ingestion switches and current exclusions.
The update agent wakes for30eligible queued inputs or oldest input30minutes;
there is no empty-queue periodic reconciliation. Defaults remain16rounds,
32calls and180seconds, with60second cooldown. Production uses two-input batches
and a configured600second deadline so paced source/permission checks can finish;
tool/round limits remain unchanged. Discord requests are paced within
each process and obey upstream cooldowns; separate services do not share a global
rate-limit queue.

Verify anonymous API denial, login/cookie/static behavior, web health, collector
health and worker status/counts. Verify persistent auth permissions and real
source reconciliation without recording private messages, tokens or source
payloads. A healthy process alone does not establish a completed update batch.
Actual release IDs, verification and outstanding limitations belong in the
rolling milestone and sanitized evidence/optimization deployment receipt.

Live browser acceptance covers native desktop/mobile sign-in, protectedAPI, nine landmarks, focus/assistant controls and logout; see evidence/optimization/hosted-site.json. A fixed same-origin referrer policy preserves native form Origin while strict origin checks reject null/foreign values.

Deployment migration032 adds service-only scoped queue claims. The worker sends its trusted shared source UUIDs; only those inputs count toward triggers or return in claimed batches. Other inputs remain deferred; no access expansion or implicit deletion occurs.

A real hosted five-input batch completed with27toolcalls; four canonical Calendar-derived map events were persisted with building links. The initial larger/time-limited pilots retained unfinished inputs and successful durable actions. See hosted-worker and hosted-event-projection receipts for exact release/timing.

Final service activation and protected-site HTTP smoke receipts are hosted-final-deployment.json and hosted-final-site.json. They distinguish final release activation from preceding live batch mutation acceptance. Access password is managed only at Railway web → Variables → SITE_ACCESS_PASSWORD.

The2026-10-18 outage follow-up verified that the actual web service-instance health fields were unset despite the manifest. They are now explicitly /healthz with60second timeout, read back through the supported service API. This gates future rollout promotion; it is not continuous uptime monitoring. Environment-config dot-path editing did not apply these fields. See [Railway health checks](https://docs.railway.com/deployments/healthchecks).

The recovery worker completed a real five-input batch in569325ms with12tools/4rounds and explicitMirodeferred status. Subsequent batches were tuned to2inputs under the same600second deadline for edit headroom; the tuned release has the same image digest and a verified active2input lease. Successful finish deletes only the handled original cache rows;15completed inputs had0payloads remaining at final verification. Optional Miro navigation outages are deferred with no source facts or full-sync claim. See hosted-worker-recovery.json and hosted-recovery.json.

Model audit rollout requires additive migration033 before deploying the compatible web/update-agent runtimes. Production model dispatch is blocked if its private start record cannot persist. Runtime startup/hourly pruning enforces bounded seven-day retention; no audit endpoint is public. Both services must roll out before claiming planner and chat coverage. See model-audit.md.

## Discord interactions

The existing discord-events collector can forward eboard mention/reply requests through the protected web service’s separately authenticated internal bridge. Both services require private `DISCORD_CHAT_ENABLED` and `DISCORD_CHAT_BRIDGE_SECRET`; the collector also needs `DISCORD_CHAT_API_ORIGIN`. No second Gateway, archive or schema is introduced. Follow [Discord conversations](discord-chat.md) for source/audience restrictions and limits; actual release verification lives in the milestone snapshot.

## Source tool deadlines

Shared source requests and tool source-validation work default to60seconds through
`server/source-timeout.js`. This includes map storage/service/attendance/presence,
Google API and OAuth transport, Discord policy/request/context reads, Miro request
and quota preflight, shared memory and bug-report tools. Web and planner use the
same default; map's internal ceiling also permits the full60seconds. Explicit
shorter caller/test deadlines and cancellation still take precedence. Existing
longer Discord retrieval/pacing and overall chat/planner run budgets are unchanged;
model dispatch, private audit, lease maintenance and request-body deadlines remain
separate. Miro's explicit request-timeout setting continues to override its default.

This change permits slower checks; it does not bypass source authorization, change
queue ordering or guarantee backlog drainage. Current release acceptance is in the
rolling milestone journal.

## Combined release — 2026-10-22

All four services received the combined working-tree source after2150passing tests (one optional upstream Miro schema test skipped),55browser checks and frontend/API builds. Fresh sanitized contexts preserve exact reachable source and pass private-value scans. Collector packages now admit four reviewed shared root modules; their Dockerfiles copy the complete sanitized server tree.

Web release046b9fd4-1d66-4adb-bd8c-ec0c54102170; update-agent bede3de6-1378-4e23-946b-a99c9fdfe35e; Discord79d8b35d-a085-44a5-afd0-4cd7b786c478; Gmail47f37200-72f0-431c-b819-218b640efdc2 all reachedSUCCESS. Reviewed036 was applied through Supabase MCP before worker rollout; existing037 was preserved. Web-only Attio configuration merges its exact source grant while preserving other grants and credentials. Website overall deadline is420000ms; Discord remains1200000ms.

Hosted checks verify login, anonymous API denial, exact index/main assets, all ten buildings including Go Greek, five Attio tools and a live read, and hidden Calendar cursors. Discord resumed its Gateway; worker organic model/Calendar activity emits diagnosticsVersion1. All27profiles were guarded-CAS switched to verified private portrait objects through MCP after compatible web was live; authenticated image bytes match original hashes and anonymous access is denied. Identity/name/email/visibility/creation facts remain unchanged. Original artwork and legacy frontend imports remain for compatibility; removing those imports is a later cleanup. No CRM test mutation or unsolicited Discord message was sent. Full receipts and scope limits live in the rolling milestone and ignored evidence/combined-release.
