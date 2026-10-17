# Preserved pre-cleanup rolling snapshot

Historical snapshot preserved before M36 consolidation. Current truth lives in milestones/milestone.md. No historical entry or migration is changed.

# Gmail ingestion verified; agent prompting and tool adapters next

M33 migration, M34 handler/event updater/sample prompt and M35 Gmail receiver are
implemented. M35 real-email ingestion acceptance is complete after independent
tester/evaluator verification. Final root integrated113/113, independent focused41/41, API build and
scoped whitespace pass. Hosted018/019 are independently verified at versions
20261017182014 and20261017182143, preserving all prior3tables/20RPCs/data/ACLs.
Cache remains exactly uuid/raw_response; separate metadata-only state stores
queue identities, leases, action receipts and mailbox checkpoints.019 API400
committed schema without history receipt; exact verification preceded receipt-only
recovery. Cause unknown; no prior migration/history was altered.

Correct Tech@NYU Chrome profile is now accessible by explicit user request.
User-executed techflock topic/publisher IAM/scoped token IAM/authenticated push
subscription are verified. Railway gmail-events666e8523-9bfb-43ac-90db-2e2c2fbd1512
in projectf13799d2-95ff-4d22-9b17-acfce19406ca/production is active on revision
79247d6f-c10f-4642-9371-540a3cee14d9. Source UUID:
2fa17434-212d-408d-ab20-448f8c2c5907. Callback/audience:
https://gmail-events-production.up.railway.app/webhooks/gmail. Server secrets are
provisioned only on that service; existing Discord/Miro services were untouched.

Independent live checks: deploymentSUCCESS, health200, unsigned/forged401,
authenticated-path POST200 at2026-10-17T18:30:24.902Z and no400 in finalsample.
Watch/checkpointready, expiration2026-10-24T18:23:50.852Z, daily renewal and5minute
reconciliation. Startup sync advanced cursor4242861; its timestamp precedes the
accepted push and does not prove push-triggered history synchronization. The user subsequently sent subject “test”; root verified one full email_received
cache entry at2026-10-17T18:34:20.688488Z with the correct source UUID. The mailbox
checkpoint advanced and is ready without an active lease. Source content/addresses
were not printed. Independent real-email tester PASS also verifies provider structure/identity,
deterministic UUID and matching pending metadata without a duplicated payload.
Final deployment webhookPOST200 at18:34:21.346384466UTC corroborates delivery.

Initial live400s were isolated after signature verification to non-string push
historyId. Final compatibility accepts only exact positive safe-integer numeric
wake-up IDs and lossless string IDs; API cursor strings alone advance checkpoints.
Canonical Base64/Base64URL and fixed enum-only diagnostics are tested. Original
failure evidence is preserved. Earlier evaluator acceptance covered signed-notification transport/auth; the
subsequent real-email check now verifies hydration and enqueue as well.

LLM handler trigger is five eligible updates OR oldest five minutes,60s cooldown,
one fenced lease, zero empty calls and explicit exact-row cleanup. Trusted source
policy and idempotent tool adapters are required. No LLM service/model calls,
concrete map/Calendar write adapters or Discord Gateway listener are active.
User wants a completion notice before collaborative prompt work.

- [evaluator real-email completion](history/2026-10-17_14-36-10-509224-evaluator-real-gmail-ingestion-accepted.md)
- [orchestrator real-email completion](history/2026-10-17_14-36-10-509224-orchestrator-gmail-setup-complete-prompting-next.md)
- [Real-email independent verification](history/2026-10-17_14-35-44-183621-tester-real-gmail-to-cache-delivery-verified.md)
- [tester final activation pass](history/2026-10-17_14-32-23-487694-tester-gmail-signed-notification-transport-pass.md)
- [evaluator final activation pass](history/2026-10-17_14-32-23-487694-evaluator-gmail-live-notification-transport-accepted.md)
- [orchestrator final activation pass](history/2026-10-17_14-32-23-487694-orchestrator-gmail-live-receiver-integrated-awaiting-email-test.md)
- [tester numeric compatibility pass](history/2026-10-17_14-29-55-486376-tester-gmail-numeric-hint-safety-pass.md)
- [evaluator numeric compatibility pass](history/2026-10-17_14-29-55-486376-evaluator-gmail-numeric-hint-compatibility-accepted.md)
- [Numeric compatibility implemented](history/2026-10-17_14-29-06-698634-coder-gmail-safe-numeric-notification-compatibility.md)
- [Live rejection isolated](history/2026-10-17_14-28-45-149971-tester-signed-gmail-push-history-type-rejection-isolated.md)
- [Diagnostic evaluator ACCEPT](history/2026-10-17_14-28-09-247527-evaluator-gmail-push-diagnostics-accepted.md)
- [Independent diagnostic regressions39/39](history/2026-10-17_14-27-51-059921-tester-gmail-push-diagnostic-regressions-pass.md)
- [coder diagnostic pass](history/2026-10-17_14-27-22-369624-coder-gmail-push-safe-diagnostics.md)
- [evaluator diagnostic pass](history/2026-10-17_14-27-22-369624-evaluator-gmail-push-diagnostics-deploy-accepted.md)
- [Live tester: watch active, callback rejection requires fix](history/2026-10-17_14-26-16-330760-tester-gmail-watch-active-callback-format-rejected.md)
- [Hosted schema independent acceptance](history/2026-10-17_14-23-00-164023-evaluator-hosted-agent-schema-and-receipts-accepted.md)
- [Local integrated107/107](../evidence/m35-gmail-subscription/root-integrated-tests.log)

---

# M34 locally complete; M35 Gmail history-page fix in progress

M34 handler passed independent tester/evaluator84/84 local acceptance. Initial
M35 tests68/68 and root combined104/104 passed, but evaluator found a101-addition
history-page stall; focused progress/failure/restart fix is required before local
M35 acceptance. All cloud activation remains pending.

M33 migration018 is locally accepted after independent tester/evaluator actual
PostgreSQL verification10/10. Hosted application is not performed. The cache has
exactly uuid and raw_response; all prior SQL and unrelated work are preserved.

User next requested the spinup handler/sample prompt and source-events updater,
then Gmail subscription, followed by notification before collaborative prompting.
Automation coder owns server/automation, provider toolTurn and local migration019
for separate metadata-only lease/cooldown/receipts. Gmail coder owns subscription
modules under server/google; tester owns independent tests/evidence. Parent owns
integration and journal. No source bodies persist outside the temporary cache.
Proposed accepted trigger is five deduplicated updates OR oldest five minutes,
60-second cooldown, one leased run and zero empty-queue model calls. Missing
source authorizer/tools fail closed; current map/Calendar write adapters do not
exist and are not fabricated. Generic handlers take backend-owned adapters.

Google project: techflock (user supplied). Existing Gmail OAuth token verifies
readonly Gmail access, with no PubSub/cloud administration scope. No PubSub topic
or subscription config is present; gcloud CLI is absent. Google Cloud console reached first-use legal terms; user was asked to handle
that screen or switch to an existing project account asynchronously. No hosted SQL, subscription,
public callback or deployment has been created. Actual activation remains pending.

- [M33 independent tester](history/2026-10-17_13-26-57-187750-tester-shared-input-cache-sql-accepted.md)
- [M33 independent evaluator](history/2026-10-17_13-26-57-188077-evaluator-shared-input-cache-local-accepted.md)
- [M34 independent planner](history/2026-10-17_13-26-57-188226-planner-cache-driven-agent-handler-plan.md)
- [M33 integration; M34/M35 plans](history/2026-10-17_13-26-57-188332-orchestrator-automation-and-gmail-implementation-started.md)

- [M35 Gmail source subscription implementation](history/2026-10-17_13-31-51-652993-coder-gmail-subscription-implemented.md)
- [M34/M35 root integration](history/2026-10-17_13-31-51-653305-orchestrator-automation-gmail-integration-and-large-mail-fallback.md)
- [M35 activation inspection](history/2026-10-17_13-31-51-653418-orchestrator-techflock-console-terms-handoff.md)

- [M34 coder complete](history/2026-10-17_13-35-54-063375-coder-agent-handler-final-implementation.md)
- [M34 tester acceptance](history/2026-10-17_13-35-54-063799-tester-agent-handler-independent-acceptance.md)
- [M34 evaluator ACCEPT](history/2026-10-17_13-35-54-063919-evaluator-agent-handler-local-accepted.md)
- [M35 initial tester results](history/2026-10-17_13-35-54-064021-tester-gmail-subscription-initial-local-tests.md)
- [M35 evaluator REQUEST FIX](history/2026-10-17_13-35-54-064110-evaluator-gmail-history-page-stall-request-fix.md)
- [M34/M35 initial integration verification](history/2026-10-17_13-35-54-064196-orchestrator-local-integrated-tests-before-gmail-page-fix.md)

---

# M27 resumed: connect Miro

User requests connecting Miro. Root found the open Tech@NYU Schedule board
`uXjVGQo4AMY=`. Existing code/schema/worker are present. Fresh local and Railway
inventories show no Miro token/scope; Railway sync is false, database credentials
are present. Live Supabase reads confirm zero miro_boards and Miro source rows.
Railway CLI is authenticated, while MCP returns Unauthorized. Independent planner
accepted configuration/preflight/initial snapshot/allowlist/live-tools then daily
activation sequence; no new schema/code required. User explicitly confirmed the
Miro Create team agreement step. Connection and live board reads remain pending.
Existing M33 status below is preserved and separate.

- [Activation plan](history/2026-10-17_13-26-00-001535-planner-miro-connection-activation.md)

---

# M33 active: shared two-column agent input cache migration

User authorized writing a local migration for Discord/email/other input buffering.
The bounded plan is migration018, public.agent_input_cache with exactly uuid UUID
primary key/default and raw_response JSONB NOT NULL. Forced RLS and explicit
service-only CRUD preserve browser denial. No source ingestion, auto-cleanup,
agent schedule, hosted SQL, map/calendar writes or deployment in this change.
Prior migrations remain immutable; no ordinary db push may replay them.

The user accepted a proposed future trigger of five deduplicated pending updates
or oldest pending age five minutes, whichever comes first, with one-minute cooldown,
one active run and no empty-queue model calls. That behavior is not implemented by
this schema. Durable facts/action state and failure/cleanup rules remain follow-up.

Migration018 is implemented locally and root-inspected: exact two columns, generic
JSONB, forced RLS and explicit service CRUD. Coder static checks pass. Independent
PGlite execution is in progress; evaluator review remains pending. Existing dirty
work is preserved; no hosted migration has been applied.

- [M33 migration plan](history/2026-10-17_13-19-48-811069-orchestrator-shared-input-cache-migration-plan.md)

- [Migration implementation](history/2026-10-17_13-20-26-527091-coder-shared-input-cache-migration.md)

---

# Agent cadence and message buffer — proposal only (2026-10-17)

The user corrected the earlier RSVP interpretation: map context concerns expressed
plans such as library visits and event-help responsibilities. The current question
is cost/context balance: source-event subscriptions, temporary Supabase buffering,
agent batching and clearing processed messages. Calendar/map changes remain tool
calls. No implementation was requested or performed in this discussion.

Recommended proposal: lightweight persistent Discord Gateway listener -> bounded
source-scoped pending-message buffer -> five-minute conditional agent batch ->
durable facts and retry-safe tool jobs -> cleanup. No model call for an empty batch.
Keep relevant thread/reply context and fetch older originals as needed; persist
plans, commitments, expiry, provenance and processing checkpoints across runs.
Edits/deletes and reconnect recovery need reconciliation. A temporary body cache
would change M29's current live-only storage boundary if subsequently implemented;
it is not enabled by brainstorming. Earlier signup/RSVP proposals are superseded.
Gmail push uses Pub/Sub/history checkpoints and subsequent message reads.

User design constraint: the proposed cache has exactly two columns, `uuid` (UUID
primary key) and `raw_response` (JSONB). Keep the Gateway event type/payload together
inside JSON; message/user/channel IDs, username/display name, available nickname,
content, sent/edited timestamps and reply references stay within that payload.
Subscribe to message create/update/delete; current nickname updates require the
appropriate member events/intents. Stable Discord user ID is identity, names are
labels. Some event fields are absent/partial; absence must not erase known values.
Delete exact successfully processed UUIDs, preserving arrivals during a batch.
This remains design work; no cache table or subscriptions have been created.

M32 remains the latest completed implementation. Existing Google consent and
Calendar tool gaps remain. Only journal files changed; no schema, source scope,
external writes, schedules or deployment changes.

- [Message buffer and agent cadence discussion](history/2026-10-17_13-10-48-637722-orchestrator-message-buffer-and-agent-cadence-discussion.md)

- [Two-column cache and Discord fields](history/2026-10-17_13-17-58-586991-orchestrator-two-column-cache-and-discord-fields.md)

---

# M32 complete: Discord scans use the user timezone

The browser samples its timezone on every chat send. The API validates the IANA
zone and captures one server clock shared by planning, tools and answering.
Discord search and read-window dates use that zone's calendar boundaries before
conversion to UTC for the bot. Both ordinary reads and RAM summaries share the
same resolver. Coverage retains the effective zone and normalized UTC bounds.
Named alternate zones and explicit-offset instants are supported. Invalid dates,
zones and offset-free datetime strings fail closed; missing legacy context or
unavailable browser detection explicitly uses UTC. Source scope is unchanged.

Independent tester95/95 Node and4/4 installed-Chrome checks pass. Root integrated
suite134/134 passes, covering shared assistant, provider, Google and Miro paths.
API and frontend builds and whitespace checks pass. Independent evaluator ACCEPT
has no remaining findings. The paired local API/Vite runtime is refreshed; actual
invalid-zone requests return400 before bot/model dispatch. No model calls, SQL,
Railway schedule changes or hosted deployment were needed. No commit or push.

Evidence: [tester report](../evidence/m32-user-time-zone/tester-report.md),
[integrated tests](../evidence/m32-user-time-zone/integrated-tests.log),
[date contract](../docs/discord-live-only.md#dates-and-user-timezone).
Browser travel was emulated, and test provider/bot responses were synthetic.
Broader natural-language dates remain model interpreted. Google query rewriting
is outside this change. Existing Miro token/scope and Google consent tasks remain.

- [Independent timezone review accepted](history/2026-10-15_21-15-58-241257-evaluator-user-time-zone-accepted.md)
- [User timezone scanning integrated](history/2026-10-15_21-15-58-242137-orchestrator-user-time-zone-integrated.md)

---

Earlier snapshots below are historical where superseded above.

# M32 active: user timezone for Discord scans

Browser requests now carry the current browser timezone. Backend normalization and
independent acceptance are underway. Calendar dates must use local day boundaries,
including DST, before conversion to UTC for Discord. One trusted request clock is
shared by planning, tools and answering. Missing legacy context explicitly uses UTC.
Source permissions, database schema and Railway schedules remain unchanged.

- [User timezone scan contract](history/2026-10-15_21-10-30-637051-planner-user-time-zone-contract.md)
- [Browser timezone transport](history/2026-10-15_21-10-30-640215-coder-browser-time-zone-transport.md)

- [Guides and local runtime](history/2026-10-15_21-12-39-903649-orchestrator-user-time-zone-guides-and-runtime.md)

Backend implementation is now present and the paired local runtime has been
refreshed. Both builds and whitespace checks pass. Initial root regressions
130/131 passed; the old date-only rejection expectation is being updated for
the intentional new contract. Independent expanded tests and review are pending.

- [Backend implementation](history/2026-10-15_21-12-51-065825-coder-user-time-zone-backend.md)

- [Independent tester acceptance](history/2026-10-15_21-14-37-017188-tester-user-time-zone-acceptance.md)

Independent tester acceptance now passes95/95 Node checks and4/4 installed-Chrome
checks. Root final integrated suite passes134/134 including Google/Miro shared
context regressions. Final independent evaluator verdict is pending.

---

# M30/M31 complete: valid Discord thread search and context-only Lipton

The reported Bolaji search failure was reproduced with successful DiscordHTTP200
responses. Our app rejected all25returned hits because two belonged to registered,
allowlisted threads beneath selected parent channels. The fix validates those
threads and their parents afresh, preserves each sourceUUID and verifies the final
catalogue again. Unknown, excluded, out-of-scope, wrong-parent/guild and revoked
threads still fail closed. Extra thread checks are bounded and partial coverage
remains explicit. No bot-role, source-allowlist, SQL or cloud-job changes.

The real running local API was refreshed after browser QA. POSTsearch-discord
with the same query now returnsHTTP200/ready and8original-linked sources, allin
configuredscope, including the2threads among18checkedchannels. Coverage is partial;
no exhaustive allmessages/authorlookupclaim. No modelcalls orcontentwrites were
needed. M29three-table/live-onlyarchitecture remains unchanged.

Lipton is removed from the selectable metadata registry. Its existing GLB,
placement,5628triangles and pale context material remain unchanged; it remains an
occluder, not an interactive landmark. Independent realChrome7/7verified five
actualrayhitmouseclicks withnohover/lift/glow/select/focus/cameramotion. Stern and
Bobst still select/focus withnormalhoverlift; nine selectable landmarks remain.

Independent evaluator accepts both changes. Root persisted the evaluator's13
thread regression cases and passed90/90combinedcurrentbackendtests; API validation
andwhitespacepass. Frontendbuild,camera21/21,keyboard14/14,resource5/5andrealbrowser
checks pass. No commit/push or public frontend deployment. The local dev pair is
running with current backend/frontend code.

Evidence: [Discord diagnosis/live retest](../evidence/m30-discord-search/info.md),
[Lipton browser acceptance](../evidence/m31-lipton-context/tester-report.md).

- [coder: authorized search thread results fixed](history/2026-10-15_20-59-50-296098-coder-authorized-search-thread-results-fixed.md)
- [tester: lipton real browser nonselection accepted](history/2026-10-15_20-59-50-296099-tester-lipton-real-browser-nonselection-accepted.md)
- [evaluator: thread scope regressions and lipton review accepted](history/2026-10-15_20-59-50-296100-evaluator-thread-scope-regressions-and-lipton-review-accepted.md)
- [orchestrator: discord thread search and lipton integrated](history/2026-10-15_20-59-50-296101-orchestrator-discord-thread-search-and-lipton-integrated.md)

---

Earlier snapshots below are historical where superseded above.

# M30/M31 active: Discord thread search and Lipton context

UserreportedBolajisearchscope denialandLiptonstillselectable. Actualbotsearch
returnsHTTP200buttheapprejectsvalidregisteredthreadhitsunderselectedparents;
noDiscord403seen. Boundedguardfixandindependentregressionsareunderway. Lipton
removedfromselectablemetadatawhilekeepingasset/placement/material; buildand
numericalcheckspass, independentbrowserQAunderway. No sourcepermissionbroadening,
no database/cloudjobs changes. M29backendremains3-table/live-only.

- [evaluator: discord scope denial path diagnosed](history/2026-10-15_20-55-58-256336-evaluator-discord-scope-denial-path-diagnosed.md)
- [coder: lipton selectable registration removed](history/2026-10-15_20-55-58-256337-coder-lipton-selectable-registration-removed.md)
- [orchestrator: discord thread scope reproduction and bounded fix plan](history/2026-10-15_20-55-58-256338-orchestrator-discord-thread-scope-reproduction-and-bounded-fix-plan.md)

---

# M29 complete: one Discord catalogue table, live bot content only

The user explicitly superseded all durable Discord summary/accounting retention.
Migration017 is applied as hosted version20261016003623. Exactly three public
tables remain: discord_view_policies, knowledge_sources and miro_boards.

Discord persistence is now one row per server in discord_view_policies: channel
catalogue JSONB, view/exclusion settings, discovery checkpoints and last completed
discovery time. All269 existing metadata/ancestry nodes,219stable channel source
UUIDs, settings and checkpoints have identical hosted before/after fingerprints.
The16other Discord tables,24summary functions and duplicate Discord source rows
were explicitly deleted. Miro/non-Discord source fingerprints are unchanged.
All three tables force RLS and deny browser access; all19application RPCs are
service-only invoker functions. No blanket dependency deletion was used.

All Discord content comes from live read-only bot requests. Failed, denied or
partial reads report their limitations; no stored/vector fallback is constructed
or invoked. Requested large-window summaries remain bounded in RAM with original
citations. Durable summary/embedding/raw compatibility interfaces retire before
network/provider dependencies. Source allowlists, ancestry/exclusions, backend
admin checks and final catalogue/policy verification remain enforced. Same-policy
revision withdrawals/remapping are tested and discard in-flight evidence.

The production discord-summaries Railway service is removed, with no content
summary cron. Miro/discovery database values were preserved before removal.
The reviewed discovery imagec056f687-2933-490b-9b47-da8d2e7430ce builtSUCCESS;
it runs metadata discovery daily10:00UTC, restartNEVER, noHTTPhealthcheck. Miro's
separate image/schedule remain unchanged and disabled pending token/board scope.
The next natural metadata invocation is not observed; build success is separate.

A real bot smoke returned one original with an allowed source and original link,
with zero model calls, posts or content writes. The actual local paired API/Vite
was restarted to load current code; status/tool metadata report live_only and no
stored fallback. No public frontend deployment or authentication redesign.
Independent tester98/98 and evaluator acceptance pass. Root final Discord358/358,
integration118/118, API validation, deployment-source hashes and whitespace pass.
No commit or push. Old catchup/summary/embedding tasks are cancelled by M29.

Evidence: [M29 checks and receipts](../evidence/m29-discord-live-only/info.md),
[current table guide](../docs/database-tables.md),
[live-only Discord contract](../docs/discord-live-only.md).

- [evaluator: hosted live only implementation accepted](history/2026-10-15_20-42-07-007651-evaluator-hosted-live-only-implementation-accepted.md)
- [orchestrator: single discord table live bot route complete](history/2026-10-15_20-42-07-007652-orchestrator-single-discord-table-live-bot-route-complete.md)

---

Earlier snapshots below are historical wherever superseded by M29 above.

# M29 locally accepted and applied; final hosted verification

Migration017 is applied. Hosted inventory now has3publictables with269catalogue
nodes and219stable sourceidentities in discord_view_policies. The summary service
is removed from production; realbotcatalogue and oneoriginalmessage read succeed
without models/storagewrites. Independent98/98 and evaluator82/82 accept local
implementation. Final cloudfingerprint comparison and metadataimagebuild readback
are underway; Miro remains preserved and paused awaiting credentials.

- [coder: live only runtime and job retirement](history/2026-10-15_20-38-07-785781-coder-live-only-runtime-and-job-retirement.md)
- [coder: single table discord catalogue migration](history/2026-10-15_20-38-07-785782-coder-single-table-discord-catalogue-migration.md)
- [orchestrator: live catalogue race and runtime integration](history/2026-10-15_20-38-07-785783-orchestrator-live-catalogue-race-and-runtime-integration.md)
- [tester: single table live only acceptance](history/2026-10-15_20-38-07-785784-tester-single-table-live-only-acceptance.md)
- [evaluator: live only local final acceptance](history/2026-10-15_20-38-07-785785-evaluator-live-only-local-final-acceptance.md)

---

# M29 active: Discord live access with one catalogue table

The user explicitly superseded summary retention: delete all Discord summaries,
vectors, accounting and worker storage. Keep only discord_view_policies, with a
JSONB channel catalogue and view/discovery settings. Miro/unrelated sources remain.
Final target:3publictables (oneDiscordtable,knowledge_sources,miro_boards).

A bounded plan is accepted. SQL017 and runtime removal of durable summary/fallback
are being implemented; independent current-schema tests are underway. Stable channel
sourceUUIDs, ancestry/exclusions, server source scope and backend admin checks stay.
Root preserved Miro/discovery database values before retiring the summary service.
No table drops or migration017application yet. Current M28 state below is historical
where superseded by this user direction.

Latest pass: [planner](history/2026-10-15_20-32-08-326058-planner-discord-single-table-live-only-plan.md).

---

# M28 complete: 19 tables and shared source access

The approved cleanup is applied and verified in the hosted Tech NYU database.
Migrations 013–016 removed 14 empty obsolete tables and the two subsequently
approved membership tables, simplified Miro to 12 columns with intact JSONB in
`data`, and renamed policy storage to `discord_view_policies`. Both
`knowledge_source_members` and `discord_admin_members` are gone.

The shared assistant uses trusted backend source scope rather than per-person
grants. `ASSISTANT_ALLOWED_SOURCE_IDS` is the shared setting, with the previous
`DEV_ALLOWED_SOURCE_IDS` accepted as an alias. Live Discord also filters by this
scope and rejects unregistered/out-of-scope channels before content requests.
Administrative API/store actions remain backend protected; internal request
contexts do not require member accounts. Frontend authentication was not redesigned.

All 19 remaining tables have identical before/after016 row fingerprints. Original
legacy summaries, receipts, certificates, compaction provenance, source records,
Miro content and vectors are preserved. All tables force RLS and deny browser
access; all 43 application RPCs remain service-only invoker. The unrelated
Supabase platform event function is unchanged. Hosted smoke verifies no-member
shared reads, administrative reads, denied unscoped reads and denied non-admin
configuration access. Counts: 722 historical +87 newer summaries, 809 ready
vectors, zero missing vectors; initial catchup still had351pending jobs.

Independent tester/evaluator acceptance is complete. Root final Discord342/342,
integration100/100, API validation, source-config alias and whitespace checks pass.
All three final reviewed Railway cron images built successfully; deployment
contexts exclude secrets/test fixtures and match current server source hashes.
Existing schedules and summary limits (50groups, 1000requests, onehour, $1run)
remain unchanged. Builds are separate from future scheduled execution.

Miro sync remains explicitly disabled because board scope/token are absent. The
previous summary cron invocation was observed publishing/embedding28results,
then returning partial under upstream rate limits; no full catchup claim. No
model calls, commit/push or public frontend deployment were initiated by cleanup.

Evidence: [M28 receipts and checks](../evidence/m28-schema-cleanup/info.md),
[remaining table guide](../docs/database-tables.md),
[hosted migration mapping](../supabase/migrations/info.md).

- [tester: shared access final regressions](history/2026-10-15_19-16-17-894224-tester-shared-access-final-regressions.md)
- [evaluator: hosted cleanup evidence accepted](history/2026-10-15_19-16-17-894225-evaluator-hosted-cleanup-evidence-accepted.md)
- [orchestrator: shared schema cleanup complete](history/2026-10-15_19-16-17-894226-orchestrator-shared-schema-cleanup-complete.md)

---

Prior snapshots below are historical wherever superseded by the current state above.

# M28 shared tool: no per-person membership tables

Userclarifiedgeneralpurposeaccessandconfirmedremovingbothmembershiptables. Sourceaccesswilluseatrustedserverconfiguredallowlist;adminchangesremainbackendprotected.015policyrenamenowhosted;016membershipsremovallocallyacceptedandapplyinprogress.19tablesfinaltarget,Miro12columns/dataunchanged. Earlier013/014hostedpreservationverified;all3firstcleanupimagesbuiltSUCCESS. Finalsharedruntimeintegration/deployment/readbackpending.

- [tester: historical memory expectation fixed](history/2026-10-15_19-11-45-410654-tester-historical-memory-expectation-fixed.md)
- [orchestrator: cleanup hosted verified and workers built](history/2026-10-15_19-11-45-410655-orchestrator-cleanup-hosted-verified-and-workers-built.md)
- [coder: policy table rename implemented](history/2026-10-15_19-11-45-410656-coder-policy-table-rename-implemented.md)
- [tester: policy rename independent accepted](history/2026-10-15_19-11-45-410657-tester-policy-rename-independent-accepted.md)
- [orchestrator: shared source access user direction](history/2026-10-15_19-11-45-410658-orchestrator-shared-source-access-user-direction.md)
- [coder: shared source authorization migration](history/2026-10-15_19-11-45-410659-coder-shared-source-authorization-migration.md)
- [tester: shared access independent accepted](history/2026-10-15_19-11-45-410660-tester-shared-access-independent-accepted.md)
- [evaluator: shared access independent final acceptance](history/2026-10-15_19-11-45-410661-evaluator-shared-access-independent-final-acceptance.md)

---

# M28 local implementation accepted; hosted rollout underway

Independent tester93/93 and final evaluator accept current001–014schema/runtime. Rootintegration preserves historicalmigrationtests using test-onlyadapter and removes obsolete npmcommands. Hostedbaseline verifies14candidatesempty and0legacyactiveleases;722legacy+87live summaries and809readyvectors/0missing retained beforecleanup.013application is inprogress; no hostedcompletionclaim yet. A broadDiscordrun foundoneobsolete memory-storetestexpectation (338/339); boundedtestfixunderway. Miro25/25 andassistant22/22pass.

- [coder: obsolete runtime entrypoints retired](history/2026-10-15_19-05-38-345287-coder-obsolete-runtime-entrypoints-retired.md)
- [tester: cleanup preservation runtime accepted](history/2026-10-15_19-05-38-345288-tester-cleanup-preservation-runtime-accepted.md)
- [evaluator: cleanup independent final local acceptance](history/2026-10-15_19-05-38-345289-evaluator-cleanup-independent-final-local-acceptance.md)
- [orchestrator: cleanup runtime integration and hosted baseline](history/2026-10-15_19-05-38-345290-orchestrator-cleanup-runtime-integration-and-hosted-baseline.md)

---

# M28 active: approved schema cleanup

The user authorized removal of14obsolete Discord/knowledge tables and15Miro columns. New migrations013/014 are implemented and locally accepted:20Discord/knowledge tables plus one12column Miro table, retaining full boardJSON in `data`. Independent actualSQL checks preserve seeded summaries, receipts, vectors, grants and in-flight Miro leases. Runtime retirement and current tests are being integrated; no hosted drops yet. Existing M25/M27 status below remains historical where superseded.

- [coder: discord storage retirement migration](history/2026-10-15_19-02-46-763315-coder-discord-storage-retirement-migration.md)
- [coder: miro twelve column schema](history/2026-10-15_19-02-46-763316-coder-miro-twelve-column-schema.md)
- [evaluator: cleanup sql local acceptance](history/2026-10-15_19-02-46-763317-evaluator-cleanup-sql-local-acceptance.md)

---

# M25: live-first chat and hosted summary-only cutover verified

Latest schema assessment (M28): **14of34 Discord/knowledge tables** are empty retirement candidates (9Discord+5knowledge), leaving20after RPC/codecleanup; no deletions performed. A narrower11-table cleanup keeps the unusedgenericdocument scaffold. **Miro can shrink27->12columns**, dropping15duplicated/optional fields while keeping access/concurrency guards. Sevenpopulatedlegacy summary/accounting tables and sharedsourceACLs stay. [Assessment](../docs/schema-cleanup-audit.md), [liveinventory](../evidence/schema-cleanup-audit/schema-inventory.json), [latest pass](history/2026-10-15_17-27-28-078351-orchestrator-schema-simplification-assessment-complete.md). CurrentM25/M27 implementation/authorization state below is preserved.

The assistant reads the requested Discord channel/time window through the bot and summarizes those originals directly. Stored Supabase summaries are a labelled fallback only after live unavailability or incomplete coverage. Denied access and successful empty reads never fall back. Actual end-to-end chat streamed a cited response from three original messages in the exact April23 New York window. Independent connector132/132, provider compatibility95/95, full Discord350/350 and builds pass; local evaluator ACCEPT.

Raw messages, revisions, copied knowledge/chunks and daily summaries are zero. All722legacy summaries,2245usage receipts and722certificates are preserved, including original fingerprints and source policy. An independent hosted audit accepts schema/access/preservation: six forced-RLS tables, nineteen service-only invoker RPCs, enabled retirement guards and valid1536-dimensional ready vectors. Local operator has218read-only source grants; production member access remains denied.

Railway metadata-only discovery completed across219sources. The summary worker has published nonempty results from direct Discord originals. The final independent snapshot verifies726/726stored summaries embedded (722legacy plus4new), with0missing/stale vectors. Initial closed-period catchup remains active in Railway;434jobs are pending and natural cron invocation is still unobserved. The initial ten-minute invocation stopped safely at its bound. Extra local drain processes have exited; ongoing work belongs to Railway. Final image28e3e78b uses the new live-summary command; configured hourly at minute10,50groups, one-hour/1000dispatch limit and unchanged$1run cap. Natural future cron execution is not yet observed. Google Gmail/Drive tools and OAuth helper are installed; account consent remains pending.

- [tester: hosted cutover independent audit](history/2026-10-15_16-59-50-398041-tester-hosted-cutover-independent-audit.md)
- [orchestrator: summary backfill operational tuning](history/2026-10-15_16-59-50-398042-orchestrator-summary-backfill-operational-tuning.md)

Latest acceptance:

- [tester: final summary vectors hosted audit](history/2026-10-15_17-03-20-942184-tester-final-summary-vectors-hosted-audit.md)
- [orchestrator: live first summary only integration accepted](history/2026-10-15_17-03-20-942185-orchestrator-live-first-summary-only-integration-accepted.md)

Earlier local evidence: [live chat smoke](../evidence/m25-cloud/live-chat-smoke.json), [preservation proof](../evidence/m25-cloud/preservation.json), [independent audit](../evidence/m25-cloud/independent-report.md). Concurrent M27 state below is preserved.

---

# M27 infrastructure deployed — awaiting Miro authorization

Apply follow-up reverified the actual deployed state: migration012/version20261015203824 is present, miro-sync image remains SUCCESS, and database references are configured. **Miro token and board scope remain absent**, so no ingestion can run yet; no duplicate migration or unconfigured enablement was performed. [Latest M27 verification](history/2026-10-15_17-05-34-755770-orchestrator-miro-apply-state-reverified.md).

The new `public.miro_boards` table is applied in Tech NYU Supabase (hosted migration `20261015203824`, local012). Each row retains one complete original board/object/layout/relationship snapshot plus freshness, coverage and lease metadata. Browser access is denied; no member grants were created.

The separate Railway **miro-sync** service is deployed successfully: `2c1afff2-84f8-4a4c-961d-686dcb39eeed`, deployment `ac53b225-d0f5-492a-93b9-f5a99cea6be5`. Cron `0 10,11 * * *` plus the worker's New York hour06 gate provides daily6AM sync across DST. Restart NEVER; no HTTP health check. **Sync is explicitly paused (`MIRO_SYNC_ENABLED=false`) because no Miro board URL/scope or token is configured.** The empty table is expected; no actual board ingestion, job invocation or future cron execution is claimed.

Four read-only Miro LLM tools are wired into the API and expose raw layout context, source links, bounded pages and recoverable object fragments. Actual local API/proxy ports3001/5173 list these tools. Source/member authorization is still required; the LLM has not read a real Miro board. This pass did not redeploy the hosted main API or alter other services.

Verified: independent Miro25/25 tests and evaluator ACCEPT; final root82 combined tests, API validation and whitespace checks pass. Hosted readback verifies protected table and service-only RPCs; Railway build/configuration and reviewed worker hashes match. [Evidence](../evidence/m27-miro-sync/info.md), [setup guide](../docs/miro-sync.md), [latest pass](history/2026-10-15_16-42-57-764213-orchestrator-miro-schema-deployed-job-provisioned.md). No commit/push or sync-time model/embedding call.

Next: obtain the board URL(s) and Miro authorization, configure sync+API runtime securely, register/sync the exact board, grant only the intended principal matching source scope, verify original snapshot/model retrieval, then enable sync and observe a scheduled run. Concurrent M25/M26 work below remains separate and preserved.

---

Prior pass state below is historical where superseded above.

# M25/M26 current: local acceptance and hosted cutover underway

M27 local implementation accepted: independent tester25/25Miro checks, independent evaluatorACCEPT, root80combinedchecks/APIvalidation and whitespace pass (beforefinal2paginationcases, independentlyret tested). Migration012, dailyworker and directliveLLMtools are implemented; allmaterial pagination/navigation findings resolved. [Tester](../evidence/m27-miro-sync/tester-report.md), [local acceptance](history/2026-10-15_16-37-58-681897-evaluator-miro-local-implementation-accepted.md), [root integration](history/2026-10-15_16-37-58-681994-orchestrator-miro-model-tools-integrated.md). Next: apply012and deployisolatedmiro-sync. Actual Miro scope/token and member grant remainpending; no liveboardread yet.

Live Discord is primary; Supabase summaries are fallback only after unavailable/incomplete live reads, with stored period/provenance disclosed. Denial or a successful empty read never falls back. Independent connector132/132 and evaluator ACCEPT; root focused summary/SQL/launch73/73 pass. Google OAuth adapter is prepared; consent remains pending.

Additive011 applied as hosted20261015203437. Service-role status verifies summary-only guard enabled,722legacy summaries preserved and1174raw originals pending cleanup.218 explicit local reader grants are read-only. Both existing Railway services have new command/schedule overrides and deployments building: metadata discovery daily10UTC; summary work hourly at minute10. Embedding backfill, actual deployed execution, raw cleanup and preservation checks are still in progress. Concurrent M27 work below is preserved.

- [orchestrator: Harden live-first retrieval and summary fallback](history/2026-10-15_16-37-04-518132-orchestrator-live-first-retrieval-fixes.md)
- [tester: Independent connector regression verification](history/2026-10-15_16-37-04-518133-tester-connector-fixes-independent-pass.md)
- [evaluator: Evaluate final M25/M26 local connector scope](history/2026-10-15_16-37-04-518134-evaluator-live-first-connectors-accepted.md)
- [coder: Retire default raw collection entrypoints](history/2026-10-15_16-37-04-518135-coder-default-raw-worker-retired.md)
- [orchestrator: Apply accepted summary schema and begin Railway rollout](history/2026-10-15_16-37-04-518136-orchestrator-summary-cloud-cutover-started.md)

---

# External reference reviewed: Morpheus

M27 implementation: [schema](history/2026-10-15_16-33-20-522783-coder-miro-schema-implemented.md) and [worker](history/2026-10-15_16-33-20-523117-coder-miro-api-worker-implemented.md) are written locally. Root added direct live Miro model/HTTP tools and isolated deployment preparation. Independent test/evaluation is underway; group pagination and multi-step model navigation are being checked/fixed. Parent connector/context regressions23/23 and API syntax/runtime validation pass. No012 application/service deployment yet; no Miro token or board scope provided.

Read public `sean-lai-sh/morpheus` main at `01e6700`: Bun/TypeScript Discord bot, SQLite originals/FTS5, scoped retrieval, queued agent replies and task/calendar modules. Source-only review; no runtime verification or adoption. Its archive-first design differs from current live-first/summary-only direction. Active M25/M26/M27 scope and status below are preserved. [Latest review](history/2026-10-15_16-29-47-159512-orchestrator-morpheus-source-review.md).

---

# Active M27: daily Miro board sync

User authorized a **new daily Railway job and new Supabase table** for Miro. Plan accepted: explicit board scope, source-only read API, raw objects/layout/relationships in `miro_boards`, atomic complete snapshots and service-only access. No model calls, embeddings or Miro writes. Target existing Tech NYU Railway/Supabase projects; preserve concurrent M25/M26 work below. Miro scope and credentials are pending (no local MIRO variables); parent asked for board/team details. Default daily6AMNY proposed. Implementation/testing/deployment remain pending. [Latest pass](history/2026-10-15_16-25-27-237542-planner-miro-daily-sync-plan.md).

---

# Active M25/M26: verified local implementation, hosted cutover next

The summary-only worker,1536-dimensional summary vectors, live Discord tools and prepared Gmail/Drive OAuth adapter are implemented locally. The assistant prompt and server routing use live bot messages first for channel/time-window summaries. Stored Supabase summaries are only a labelled, permission-scoped fallback after a live limitation; denied or successfully empty reads do not fall back. Larger chat windows use RAM-only direct map/reduce under a per-request budget. Google account authorization is still pending.

Verification: independent connector103/103, summary-focused44/44 and full Discord328/328 tests pass. Independent evaluator accepts local summary/SQL implementation. Helper-specific tests and connector evaluation are in progress. No cloud schema/deployment change yet. Actual hosted read-only baseline:1174 originals,1 revision,722 legacy summaries,218 registered sources,0 reader grants and0 active legacy leases. Summary fingerprint:4dd4471d4d877a9c60cd94ab4cee2c6a.

Next: apply reviewed additive011, enable summary-only mode after old worker retirement, deploy hourly bounded summary work and daily metadata-only discovery, backfill vectors, remove only raw copies and verify preservation. No daily raw archiving remains in the proposed runtime. Existing map/frontend changes are preserved. Google consent/client credentials are the remaining account input.

Latest local pass: [Root integration](history/2026-10-15_16-25-07-875554-orchestrator-live-first-chat-and-google-integrated.md).
- [Recorded pass](history/2026-10-15_16-25-07-874592-coder-live-discord-tools-implemented.md)
- [Recorded pass](history/2026-10-15_16-25-07-875002-coder-google-runtime-connector-implemented.md)
- [Recorded pass](history/2026-10-15_16-25-07-875138-coder-summary-only-worker-implemented.md)
- [Recorded pass](history/2026-10-15_16-25-07-875250-tester-connector-runtime-independent-pass.md)
- [Recorded pass](history/2026-10-15_16-25-07-875353-tester-summary-only-independent-pass.md)
- [Recorded pass](history/2026-10-15_16-25-07-875458-evaluator-summary-only-local-accepted.md)

---

# Active M25/M26: live Discord, summary-only storage and Google connector

Latest research (2026-10-15): user confirmed **Miro Free** and a calendar built from shapes, text, cards and stickies. [Research](../docs/miro-api-research.md) proposes REST extraction with original objects, spatial relationships and evidence-linked calendar interpretation for LLM use. Live/on-demand reads need no permanent store. Exact completeness/interpretation remains unverified; no Miro connection or implementation in this pass. Concurrent implementation priorities below are preserved. [Latest pass](history/2026-10-15_16-20-23-307110-orchestrator-miro-llm-context-representation.md).

User authorized replacing raw Discord archive storage with direct bot-fetched completed weekly/monthly per-channel summaries, embedding every stored summary, connecting the assistant to liveDiscord, and preparing Gmail/Drive access for the club account. **LiveDiscord is primary for channel/time-window questions; Supabase summaries are fallback only, disclosed and never used to bypass denied permissions.** Scheduled summaries likewise fetch originals directly from Discord into RAM. Preserve legacy summaries, source ACLs/policy/citations and budget receipts; no durable raw message bodies after cutover. Both completed weekly/monthly tiers must run when coincident. Google usesOAuth, with actual account consentpendinguser.

Three actual implementation specialists own disjoint modules. Root owns sharedAPI/provider/runtime/deploy/package/docs, secret-safecloudoperations and journals. Plans:
- [Plan 1](history/2026-10-15_16-11-30-437992-planner-summary-only-railway-plan.md)
- [Plan 2](history/2026-10-15_16-11-30-438394-planner-live-discord-tools-plan.md)
- [Plan 3](history/2026-10-15_16-11-30-438517-planner-google-connector-plan.md)

Current cloud read-only inventory: Tech NYU project f13799d2-95ff-4d22-9b17-acfce19406ca has discord-archive and discord-summaries services; oldcommands still active. No schema/deployment/cutover yet. Prior M24/map changes remain local and preserved. Next: implementation contracts, independenttests/review, then verified rollout. Google account authorization remains a separate pending input.

---

# M24: floating Spotlight assistant and base LLM integration — complete

The assistant is a compact centered native dialog over the campus map, closed by default. Open the launcher or Cmd/Ctrl+K; query first, streamed replies and safe source links below. Enter submits, Shift+Enter adds a line, Escape/backdrop restores focus. Offline drafts remain editable; sending requires configured model/access. Completed history/drafts survive dismissal; close/Stop cancels unfinished generation. Modal scrolling/typing does not move the map. Map assets, geometry, palette and M23 movement are preserved.

`npm run dev` starts the Hono API, waits for identified health, then starts Vite; PORT drives both API and proxy. Existing listeners are preserved and owned children cleaned on failure/signals. `dev:web` and watched `dev:api` remain available; paired mode needs restart after backend edits. Status checks time out after eight seconds and distinguish configuration/access/transport failure without probing the model. Existing compatible/Anthropic adapters and server-only credentials remain unchanged. Main routes: /healthz, /api/status and protected /api/chat; core modules: assistant.js/css, chat-client.js, tools/dev.mjs, server/app.js and vite.config.js.

Verified: independent tester **90/90** (34 assistant,3 runtime,53 Chrome), root camera/input/movement **51/51**, final frontend/API builds and diff check pass. Root single live configured gpt-6-luna adapter smoke returned OK in2087ms with no database/source retrieval. Independent evaluator **ACCEPT**, no material findings; root inspected desktop/mobile visuals. Evidence: [independent browser/transport](../evidence/m24-spotlight-assistant/info.md) and [live adapter smoke](../evidence/m24-spotlight-live/info.md). Existing Vite chunk-size warning remains. Initial HMR-interrupted test is preserved and superseded by passing stable runs.

Local app: http://127.0.0.1:5173/ with root-started API watcher3001; actual status returned200. This is local, uncommitted work on codex/dev at ff38922; no push/deployment or schema/source ingestion. Physical mobile inputs, other browsers and current cloud health remain unverified. Production authentication/access policy, summary retrieval in chat, Drive/Calendar, activity UI and summary-cron observation remain separate priorities below. Next: user feedback on the assistant; proceed on those product gaps only when requested.

Latest access inventory (2026-10-15): server credentials are configured, but the current local principal has **zero allowed source IDs**. Actual Discord search returns403forbidden; admin is denied. Only model tool is search_discord (raw archive); automatic knowledge_search is also scope-gated. No club records are retrievable by this local session until explicit allowlist and database grants permit them. No permission change or cloud/model call in this inventory. [Access inventory](history/2026-10-15_16-00-40-260194-orchestrator-assistant-access-inventory.md).

Architecture discussion: direct bot-backed Discord search/history is viable without a message store; official current API docs include guild search. Recommended as a live retrieval option, with stored summaries optional for historical reuse. This is a proposal only; bot endpoint support is unverified and no implementation/permission/storage changes were made. [Discussion](history/2026-10-15_16-02-58-711944-orchestrator-live-discord-retrieval-discussion.md).

Implementation acceptance: [M24 integrated](history/2026-10-15_15-58-16-842101-orchestrator-spotlight-assistant-integrated.md).
- [Independent tester acceptance](history/2026-10-15_15-58-16-841550-tester-spotlight-transport-browser-accepted.md)
- [Independent evaluator acceptance](history/2026-10-15_15-58-16-841973-evaluator-floating-assistant-accepted.md)
- [UI implementation](history/2026-10-15_15-54-02-513725-coder-floating-spotlight-ui.md) and [runtime implementation](history/2026-10-15_15-54-33-644310-coder-paired-local-llm-runtime.md)
- [Plan](history/2026-10-15_15-50-32-272982-planner-spotlight-assistant-plan.md)

Prior status/implementation sections below are historical where superseded above.

---

# Repository status checked — 2026-10-15

Current branch is `codex/dev` at `ff38922`, matching the cached remote-tracking ref; no remote fetch was performed. Existing M23 movement changes and the functionality audit remain uncommitted (12 modified tracked files and 13 untracked status entries before this journal update). M23 is complete; product follow-ups remain below.

Fresh direct checks: frontend build and API validation pass; assistant tests 33/33 and smooth WASD checks 14/14 pass. Existing Vite chunk-size warning remains. Browser and live cloud/model behavior were not rechecked. Recorded hosted counts below are historical evidence, not current measurements.

Latest status pass: [Repository status check](history/2026-10-15_15-47-37-997695-orchestrator-repository-status-check.md). Previous implementation acceptance and audit remain below.

---

# M23: smooth WASD — complete

Smooth and60% faster WASD accepted. keyboard-pan.js uses exact XZ velocity integration14/s acceleration/direction,24/s braking and250ms real-elapsed tail; cruise distance×.8 capped24–192m/s. main forwards uncapped elapsedSeconds while movement remains capped100ms. Typing/blur/visibility/loading/modifiers and pointer/wheel/scripted/reset/restore handoff clear momentum/keys, repeats cannot resurrect travel, bounds discard blocked-axis velocity. Independent14 numerical +16Chrome checks and root startup9/camera21/input16 + preserved14Chrome checks pass; build/diff pass, no JS errors. Total60 local assertions and30browser checks. Earlier47 count for the root9+21+16 was an arithmetic typo; actual46. API status mocked; physical keyboard feel/mobile/other hardware unverified. Default Chrome sample median16.4ms; software renderer too slow for short motion probes. Assets/palette/backend untouched; prior audit/product follow-ups preserved. Local preview http://127.0.0.1:4183/. No commit/deployment/model/cloud operation. Next: user feedback on movement tuning.

Latest pass: [Smooth faster WASD integrated and verified](history/2026-10-13_23-08-26-024761-orchestrator-smooth-faster-wasd-integrated.md).

Prior M23 passes:
- [Smooth and faster WASD plan accepted](history/2026-10-13_22-57-24-548626-planner-wasd-easing-and-speed-plan.md).
- [Smooth faster WASD implemented](history/2026-10-13_22-59-46-865345-coder-eased-faster-keyboard-pan.md).
- [Numerical WASD checks pass; software browser limit identified](history/2026-10-13_23-01-35-883096-tester-numerical-pass-software-browser-limit.md).
- [Keyboard release deadline integration corrected](history/2026-10-13_23-03-08-590892-coder-keyboard-real-frame-time-integration-fix.md).
- [Independent smooth WASD numerical and browser checks passed](history/2026-10-13_23-06-13-229835-tester-smooth-faster-wasd-independent-acceptance.md).
- [Smooth faster WASD accepted by independent evaluator](history/2026-10-13_23-08-25-997091-evaluator-smooth-faster-wasd-accepted.md).

---

# Current functionality audit — 2026-10-13

The requested inventory is complete. Current visible product: detailed Washington
Square 3D map with ten selectable roots, hover/lift/focus, orbit/pan/zoom/WASD,
automatic preparation/retry and an assistant panel. /admin.html provides guarded
Discord channel settings. The default map-only styling hides the older toolbar,
explorer, date and camera controls. No connected building/day activity or history
view exists. Chat supports streaming, cancellation and source links when configured.

Hono, permission-scoped Supabase persistence and Discord collection/retention are
implemented. Recorded October 12 hosted evidence establishes 216 sources, 722
weekly/monthly summaries and four current-week raw messages, representing 108,957
originals. This audit did not recheck current cloud health. Default production auth
still denies protected routes; chat uses raw Discord search, with no summary-store
retrieval wired into it. Drive/Calendar adapters and active embeddings are absent.
Daily collection has recorded cron execution; actual summary cron invocation is
still an operational follow-up. Several older guides/snapshot sections below are
historical and must not override this inventory or the current M20/M21 state.

Fresh root verification: 354 local assertions passed (270 Discord, 33 assistant,
51 frontend), API/frontend builds passed and Chrome startup/input/grouping passed
14/14 with no uncaught JS errors. Browser API status was mocked; physical hardware
and live model/backend behavior are unverified. Existing Vite chunk-size warning
remains. Two independent evaluators inspected frontend/backend source and recorded
evidence; they did not run these root checks. Application code unchanged.
Next: member auth/access policy, cited weekly/monthly retrieval in chat, integrations
and activity UI; observe summary scheduling and refresh stale guides.

- [Read-only frontend audit](history/2026-10-13_22-10-34-878332-evaluator-frontend-functionality-audit.md)
- [Read-only backend audit](history/2026-10-13_22-10-34-879169-evaluator-backend-functionality-audit.md)
- [Current functionality inventory and local verification](history/2026-10-13_22-10-34-879533-orchestrator-current-functionality-audit-verified.md)

---

# Completed M22: accumulated work committed and published

The authorized working tree was split into coherent commits and pushed normally
to origin/codex/dev:

- 6ca5228: Discord discovery, per-channel RAG retention, admin/backend/deployment and fixtures.
- e991922: campus startup, camera/WASD controls and Stern/Gould selection.
- 94eb208: current guides, hosted metadata proofs, browser evidence and milestone history.

Direct remote verification matched local94eb208 and the working tree was clean.
A final small forward publication-receipt commit records that verification;
there is no forcepush or history rewrite.

Verification: Discord270/270, frontend51/51 and assistant33/33 checks passed
(354total); API/frontend builds passed. The historical scale fixture was corrected
without changing applied001–010, and generated fixture artifacts now use unique
OS temporary directories. All253legacy evidence hashes stayed unchanged during
rerun. Staged source/evidence and138built files contain no actual secret values.
Local.env, MCP configuration, build output and Supabase CLI cache remain ignored.
No cloud/model/deployment or purchase belongs to this publication pass.
[Verified publication](history/2026-10-13_12-46-26-733624-orchestrator-split-commits-published.md). Product follow-ups below remain open.

---

# Latest completed map feedback: M21

The user removed the loading design: there is no gear screen, moving placeholder
text or entry CTA. index.html/map-startup.js show a small truthful preparing/retry
notice only and automatically activate the prepared map/assistant through the
existing loading-state gate. WASD pans relative to the current camera bearing,
translating camera and target equally; bounds, zoom/height, typing/modal/modifier
shortcuts, blur and visibility guards are preserved.

Bobst and Silver focus20%farther back through distanceScale1.2, with their angles
unchanged and no compounding. Desktop distances264.466m/206.738m are verified.
Gould Plaza no longer has a separate record/profile: both original models share
one Stern root for picking, selection, hover/glow/lift and complete focus bounds.
Original component world bounds are unchanged; actual plaza click selects Stern.
10selectable roots remain. Source models and palette are unchanged.

Verified directly: startup9, keyboard5, camera21, input16 tests; Chrome input/grouping
14 and view/return/hover23 checks, build and diff check passed. Production camera
load3075ms; no uncaught JS errors or failed requests in that suite. Captures and
reports: evidence/m21-map-input/. Local preview http://127.0.0.1:4179/.
[Latest accepted pass](history/2026-10-11_18-00-17-290170-orchestrator-map-feedback-chrome-accepted.md).
No specialists ran per user request; physical input hardware and original user-tab
control are not claimed. Existing global distance cap still applies to portrait
fits. Next: optional user map feedback; preserve separately authorized backend work.

Prior M20 UI states below are historical and superseded by the removal request.
Concurrent backend state is preserved below; no cloud/publication/model call was
made by this frontend pass.

---

# Active M21: direct map feedback

Gear loading screen is stripped. Map preparation auto-opens the map/assistant
through the existing truthful resource/scene gate; only a small startup status or
retry remains. WASD pans both camera and target on the ground plane with typing,
modal and blur guards. Bobst and Silver use1.2× their former focus distance at the
same angle. Gould Plaza is no longer separate: a shared Stern root owns both
parts, selection, hover movement, glow and complete focus bounds.

Direct startup9/9, WASD5/5, camera21/21 and interaction16/16 checks plus production
build passed. Browser input/grouping and camera suites are running. Current
modules: map-startup.js, keyboard-pan.js, main.js, building-views.js and index.html.
[Implementation pass](history/2026-10-11_17-56-50-672507-orchestrator-map-startup-wasd-stern-group-implemented.md). Next: browser/visual acceptance and final journal.
Prior M20 loader is superseded by the user's removal request. Backend state below
is preserved; no cloud, publication or model call belongs to this pass.

---

# Current backend milestone: M20 Discord summary retention

The authorized implementation, actual compaction and root-enforced read-only
storage/permission audit are accepted. Independent tester analysis passed99 artifact
assertions; final read-only evaluator PASS found no material mismatch. Root executed
hosted checks and specialists independently analyzed their attributed results. Keep per-channel RAG records: individual
messages from the current America/New_York Monday–Sunday week, one weekly summary
per completed earlier week in the current month, and one monthly summary per older
month. Current-week originals survive month boundaries until the next Monday can
complete the prior monthly record. Names accompany normalized channel IDs.
No daily AI summaries, Discord posts, briefings, automatic context injection,
images, embeddings or new reader grants. Member authentication, production RAG
wiring and embedding provider choice remain future work.

Latest measured storage: 722 summaries (673 monthly and 49 weekly), four raw
October 12–18 messages, and zero raw before Monday 2026-10-12T04:00Z. Verified
active-ledger representation is 108,953 originals plus four raw, conserving
108,957 collected originals. Current raw freshness is the daily collector's
2026-10-12T06:26:52.992Z watermark across all 216 sources; no real-time Gateway
collection is claimed. The terminal snapshot verified hashes, names/IDs, permissions, coverage,
cleanup, excluded scope and zero vectors. Root executed SQL after both MCP sessions
required reauthentication; specialists independently analyze the attributed result.
The runtime connection works. Snapshot and guarded-reader proof are in evidence/.

Original frozen bootstrap 46219c71-4480-43e1-961d-a8f5844efbac completed 695/695 jobs:
673 monthly and 22 weekly summaries cover 107,067 older originals, leaving 1,769
October 5–11 originals from its 108,836 baseline. Its 2,190 dispatches cost
$4.029992 estimated, with unchanged $5/10,000-request caps. Inputs, processing
parts, revisions, unfinished jobs and reserved receipts were zero at completion.
Proof: evidence/m20-discord-summaries/hosted-original-bootstrap-terminal-proof.json.

Updated archive image 698e7995-d508-4cfe-9976-31d4da7efe5f completed ready/exit zero:
216 sources/pages, 8,218 scanned and 297 writes, no embeddings. It added 119 net
raw without resurrecting any compacted range. A subsequent daily run advanced all
216 watermarks and added two more current-week originals. Automatic discovery and
category/channel exclusions remain active for guild 1203562091500404776. Categories:
1461311169586266165, 1533053124606955600, 1203562092213305371, 1203562092376891445;
channel 1203562091982622819. Unknown ancestry and unavailable permissions fail closed.
No thread joining, image/file-byte downloads or message posting.

Monday rollover 0c20826c-2d5c-4eb9-a598-b3d5f4965571 completed 722/722 linked jobs:
695 valid historical jobs were reused and 27 new weekly summaries replaced 1,886
pre-Monday originals. Local planning transport timeouts saved durable checkpoints;
all local workers exited before the same operation resumed on Railway. No budget
reset or concurrent paid worker. It made 55 dispatches at $0.0800596 authoritative
DB spending, including conservative unknown-dispatch charges. Combined estimate:
$4.1100516, distinct from a provider invoice. Cloud result ready/complete/exit zero
at 15:34:40Z confirms 27 groups and 1,886 represented originals. Terminal and cloud
proofs are in evidence/m20-discord-summaries/.

Applied migrations 001–010 are immutable; hosted mapping is in
supabase/migrations/info.md. Durable planning, complete input/segment coverage,
original citation validation, lease/policy/access checks and canonical dependency
fingerprints gate atomic publication. Only verified publication removes consumed
originals, revisions, temporary processing bodies and obsolete summaries. Compacted
ranges prevent collection from restoring discarded history. Minimal provenance,
counts, hashes, citations, lineage and usage receipts remain; no hidden raw backup
or physical disk-reclamation claim. The factual pilot was reviewed, while full
model output has not all been independently fact-graded.

Exactly gpt-6-luna uses text-only structured Responses and prompt v3. Default output
is 6,400 tokens; one explicit eligible token-limit failure may reserve a retry up
to 12,800 within existing attempt/cost caps. Final-answer selection, citation enums
and reduction are bounded; selected output is limited to 32 KiB. Latest local
80 provider/11 cache/API/review evidence passed. Execution SQL/lock deadlines are
55 seconds with 60-second HTTP limits; publication retains 60/65. No global role
settings or browser access were changed. Applied migration bodies are never replayed
at worker startup. No further paid diagnostic calls are required.

Summary service 69883843-95df-4d3b-9a16-e44983e1964e uses accepted deployment
d0c15dd5-544e-4349-968e-c9bdcda11bd5 and starts
`node server/discord/summary-cli.js scheduled --max-runs 100`. Restart NEVER,
zero retries, no HTTP healthcheck. Successful one-shot jobs stop normally.
Cron `0 12,13 1 * 1` checks both UTC offsets; the app gates 08:00 New York on
Mondays and the first. Current service and effective image settings independently
match. Actual scheduled summary execution remains unverified; available logs do
not prove a missed trigger. Next summary slot: October 19 at 12:00Z. Daily archive
cron `15 6 * * *` has actually executed; next October 13 at 06:15Z. Private Railway
variables and the verified 25-file backend-only deploy context exclude `.env`,
frontend assets, migrations and evidence.

Next: observe a future scheduled summary invocation and reconnect developer MCP.
The current implementation/data handoff is accepted; the connector limitation does
not stop the runtime workers. Observe a future summary
cron invocation as ongoing operational verification; member auth/RAG integration
and embedding selection require later product work.

Recent recorded passes:

- [discord-retention-integrated-and-handed-off](history/2026-10-12_20-15-25-394452-orchestrator-discord-retention-integrated-and-handed-off.md)

- [terminal-retention-evidence-accepted](history/2026-10-12_20-15-25-394332-evaluator-terminal-retention-evidence-accepted.md)

- [terminal-artifact-analysis-accepted](history/2026-10-12_20-15-25-393876-tester-terminal-artifact-analysis-accepted.md)

- [terminal-readonly-storage-audit-passed](history/2026-10-12_20-04-41-261636-orchestrator-terminal-readonly-storage-audit-passed.md)

- [terminal-mcp-authentication-unavailable](history/2026-10-12_20-04-41-259869-tester-terminal-mcp-authentication-unavailable.md)

- [Current retention snapshot reconciled](history/2026-10-12_14-19-44-713626-orchestrator-current-retention-snapshot-reconciled.md)

- [Completed retention guides refreshed](history/2026-10-12_14-18-00-320399-orchestrator-completed-retention-guides-refreshed.md)

- [Monday rollover cloud completed](history/2026-10-12_14-16-28-035930-orchestrator-monday-rollover-cloud-completed.md)

- [Railway cron consistency accepted](history/2026-10-12_14-13-49-404342-evaluator-railway-cron-config-consistency-accepted.md)

- [Monday rollover planning resumed](history/2026-10-12_10-11-25-821709-orchestrator-monday-rollover-planning-resumed.md)

- [Post-compaction collector accepted](history/2026-10-12_06-32-06-705063-orchestrator-post-compaction-collector-accepted.md)

- [Original bootstrap completed](history/2026-10-12_00-35-05-429197-orchestrator-original-bootstrap-completed.md)

- [Monday rollover sequence accepted](history/2026-10-12_00-06-31-496506-planner-monday-rollover-sequence-accepted.md)

- [Updated archive image built](history/2026-10-11_23-59-22-165191-orchestrator-updated-archive-image-built.md)

- [Railway worker guide corrected](history/2026-10-11_23-55-58-174010-orchestrator-railway-worker-guide-corrected.md)

- [tester terminal audit prepared](history/2026-10-11_23-50-59-152811-tester-terminal-audit-scope-prepared.md)

- [adaptive image cloud resumed](history/2026-10-11_23-17-48-511720-orchestrator-adaptive-image-cloud-resumed.md)

- [evaluator truncation recovery accepted](history/2026-10-11_23-14-26-988745-evaluator-bounded-truncation-recovery-local-accepted.md)

- [tester truncation recovery accepted](history/2026-10-11_23-14-26-988247-tester-bounded-truncation-recovery-local-accepted.md)

- [coder truncation recovery accepted](history/2026-10-11_23-14-26-986413-coder-bounded-truncation-recovery-local-accepted.md)

- [bounded truncation recovery contract](history/2026-10-11_23-06-26-665054-orchestrator-bounded-truncation-recovery-contract.md)

- [summary handoff guides refreshed](history/2026-10-11_22-51-18-831284-orchestrator-summary-handoff-guides-refreshed.md)

- [patched010 cloud bootstrap resumed](history/2026-10-11_22-44-27-310317-orchestrator-010-image-cloud-bootstrap-resumed.md)

- [hosted010 and concurrentclaims accepted](history/2026-10-11_22-40-00-076068-orchestrator-hosted-010-concurrent-claim-accepted.md)

- [evaluator010 locally accepted](history/2026-10-11_22-38-24-049988-evaluator-execution-budget-010-local-accepted.md)

- [tester010 locally accepted](history/2026-10-11_22-38-24-047877-tester-execution-budget-010-local-accepted.md)

- [coder: execution budget 010 implemented](history/2026-10-11_22-33-49-075075-coder-execution-budget-010-implemented.md)

- [orchestrator: hosted execution timeout diagnosed](history/2026-10-11_22-33-49-072975-orchestrator-hosted-execution-timeout-diagnosed.md)

- [cloud partial storage audit](history/2026-10-11_22-18-58-221513-orchestrator-cloud-partial-storage-audit.md)

- [Railway live and cron enabled](history/2026-10-11_22-11-43-614327-orchestrator-railway-summary-live-and-cron-enabled.md)

- [actual6400 and Railway handoff](history/2026-10-11_22-01-47-312160-orchestrator-6400-live-accepted-railway-handoff.md)

- [evaluator6400 accepted](history/2026-10-11_21-47-06-555013-evaluator-6400-output-ceiling-accepted.md)

- [tester6400 accepted](history/2026-10-11_21-47-06-554148-tester-6400-output-ceiling-accepted.md)

- [live phase and6400 ceiling](history/2026-10-11_21-45-18-168226-orchestrator-live-phase-accepted-and-6400-ceiling.md)

- [evaluator: response phase parser local accepted](history/2026-10-11_21-42-34-214546-evaluator-response-phase-parser-local-accepted.md)
- [tester: response phase parser local accepted](history/2026-10-11_21-42-34-214448-tester-response-phase-parser-local-accepted.md)
- [coder: response phase parser implemented](history/2026-10-11_21-42-34-213614-coder-response-phase-parser-implemented.md)
- [orchestrator: live output and phase diagnostic](history/2026-10-11_21-42-34-212257-orchestrator-live-output-and-phase-diagnostic.md)

- [evaluator output ceiling accepted](history/2026-10-11_21-27-00-726528-evaluator-output-ceiling-local-accepted.md)

- [tester output ceiling accepted](history/2026-10-11_21-27-00-725688-tester-output-ceiling-local-accepted.md)

- [live decoder and output ceiling fix](history/2026-10-11_21-23-24-819679-orchestrator-live-decoder-accepted-output-ceiling-fix.md)

- [citation decoder local accepted](history/2026-10-11_21-19-29-779004-evaluator-citation-decoder-local-accepted.md)

- [citation decoder and DAG local accepted](history/2026-10-11_21-17-36-636725-tester-citation-decoder-and-dag-local-accepted.md)

- [citation decoder and bounded packing](history/2026-10-11_21-15-16-326950-coder-citation-decoder-and-bounded-packing.md)

- [live citation stop and decoder contract](history/2026-10-11_21-05-24-902761-orchestrator-live-citation-stop-and-decoder-bound-contract.md)

- [actual Luna pilot and history started](history/2026-10-11_21-01-31-182232-orchestrator-luna-factual-pilot-published-and-history-started.md)

- [hosted695zero-paid planning accepted](history/2026-10-11_20-45-09-209036-orchestrator-hosted-planning-695-zero-paid-accepted.md)

- [fresh worker context and live planning](history/2026-10-11_20-43-21-669444-orchestrator-fresh-worker-context-and-live-planning-progress.md)

- [hosted009 applied and guards verified](history/2026-10-11_20-40-10-775332-orchestrator-hosted-009-applied-and-guards-verified.md)

- [sliced planning local accepted](history/2026-10-11_20-39-29-280484-evaluator-sliced-planning-local-accepted.md)

- [sliced planning final local accepted](history/2026-10-11_20-38-37-443194-tester-sliced-planning-final-local-accepted.md)

- [frozen budget runner recovery](history/2026-10-11_20-35-43-696229-coder-frozen-budget-runner-recovery.md)

- [sliced storage and accounted recovery](history/2026-10-11_20-33-02-192682-coder-sliced-storage-and-accounted-recovery.md)

- [stale plan budget and resume contract](history/2026-10-11_20-30-52-430597-orchestrator-stale-plan-budget-and-resume-contract.md)

- [Railway readback before summary rollout](history/2026-10-11_20-25-30-973567-orchestrator-railway-readback-before-summary-rollout.md)

- [evaluator sliced planning findings](history/2026-10-11_20-23-59-194357-evaluator-sliced-identity-recovery-request-fixes.md)

- [tester sliced planning findings](history/2026-10-11_20-23-59-193851-tester-nine-migration-scale-and-recovery-finding.md)

- [live name count and rollout docs](history/2026-10-11_20-16-23-051553-orchestrator-live-name-count-and-rollout-docs.md)

- [planning-only resume harness](history/2026-10-11_20-15-31-357826-orchestrator-planning-only-resume-harness.md)

- [resumable planning runner accepted](history/2026-10-11_20-14-24-603768-coder-resumable-planning-runner-accepted.md)

- [008 api cap failure and largest profile](history/2026-10-11_20-09-06-431965-orchestrator-008-api-cap-failure-and-largest-profile.md)
- [resumable source period planning contract](history/2026-10-11_20-09-06-432494-planner-resumable-source-period-planning-contract.md)

- [planning only 008 213 accepted](history/2026-10-11_19-55-13-111585-tester-planning-only-008-213-accepted.md)
- [planning only 008 local accepted](history/2026-10-11_19-55-13-112040-evaluator-planning-only-008-local-accepted.md)

- [post 007 timeout and native profile](history/2026-10-11_19-53-34-269171-orchestrator-post-007-timeout-and-native-profile.md)
- [planning only 180 second brief](history/2026-10-11_19-53-34-270073-planner-planning-only-180-second-brief.md)
- [planning only budget implemented](history/2026-10-11_19-53-34-270190-coder-planning-only-budget-implemented.md)

- [seven migration wide payload 212 accepted](history/2026-10-11_19-38-19-837124-tester-seven-migration-wide-payload-212-accepted.md)
- [bounded 007 local accepted](history/2026-10-11_19-38-19-837495-evaluator-bounded-007-local-accepted.md)

- [summary planning wide row join removed](history/2026-10-11_19-32-41-768883-coder-summary-planning-wide-row-join-removed.md)
- [proposed 007 hosted plan verified](history/2026-10-11_19-32-41-769605-orchestrator-proposed-007-hosted-plan-verified.md)

- [Hosted006 and preview timeout](history/2026-10-11_19-27-58-515317-orchestrator-hosted-006-and-preview-timeout.md)

- [calendar retention final 211 acceptance](history/2026-10-11_19-23-16-246948-tester-calendar-retention-final-211-acceptance.md)
- [calendar retention local accepted](history/2026-10-11_19-23-16-247463-evaluator-calendar-retention-local-accepted.md)

- [calendar storage and cross month completion](history/2026-10-11_19-17-25-267056-coder-calendar-storage-and-cross-month-completion.md)
- [calendar source catch up and attribution integration](history/2026-10-11_19-17-25-267409-orchestrator-calendar-source-catch-up-and-attribution-integration.md)

- [calendar runner and name context](history/2026-10-11_19-13-44-178916-coder-calendar-runner-and-name-context.md)
- [separate railway summary service prepared](history/2026-10-11_19-13-44-179310-orchestrator-separate-railway-summary-service-prepared.md)

- [Calendar contract guides and live read check](history/2026-10-11_19-12-15-345070-orchestrator-calendar-contract-guides-and-live-read-check.md)

- [coder: retention storage and planning optimized](history/2026-10-11_19-08-53-136348-coder-retention-storage-and-planning-optimized.md)
- [tester: retention largest reducer finding](history/2026-10-11_19-08-53-137558-tester-retention-largest-reducer-finding.md)
- [evaluator: retention reducer review request fixes](history/2026-10-11_19-08-53-137678-evaluator-retention-reducer-review-request-fixes.md)
- [orchestrator: retention reducer count cap fixed](history/2026-10-11_19-08-53-137781-orchestrator-retention-reducer-count-cap-fixed.md)
- [orchestrator: calendar week and channel name scope](history/2026-10-11_19-08-53-137871-orchestrator-calendar-week-and-channel-name-scope.md)

---

# Latest completed UI follow-up: M20 loading gears

Final user direction is implemented: original reference-size gears shifted to the
left edge; one CTA on the right; entire visible title/status column removed.
Title and real status remain accessible but nonvisual. Same button is disabled
while loading, enters only when ready, and retries on failure. Five placeholder
phrases move around the gears. Three composited HTML rotors and five text layers
replace the initial 57 SVG layers and runtime animation loop. Reduced motion is
supported; real readiness/error gates are unchanged.

Direct acceptance: build/diff passed; 13 state checks, 4 geometry/keyframe checks
and 12 Chrome checks passed. Chrome recorded 8 accelerated transform layers and
5 accelerated opacity layers, with no uncaught JS errors. Desktop/mobile loading,
ready/entry/failure screenshots inspected; source vector hashes and original
838px field at1440px verified. Final evidence: evidence/m20-loading-gears/.
[Latest accepted pass](history/2026-10-11_17-43-19-614148-orchestrator-loader-original-scale-left-single-cta-accepted.md). [Implementation guide](../docs/loading-screen.md).
No subagents used for this direct follow-up. Physical touch/device-wide FPS and
original user-tab control are not claimed. Local preview: http://127.0.0.1:4179/.

M19 original camera zoom remains restored; its prior numerical20/20 and Chrome
23/23 evidence is in evidence/m19-building-views/restored-zoom/. M20 does not
modify map geometry/palette/camera behavior. Concurrent backend state is preserved
below. Earlier size/title/rotation approaches below are historical where superseded.
Next: optional user visual feedback; continue separately authorized backend work.

---

# M20 loading gears refinement active

First native-vector reference pass passed direct state/motion/Chrome checks but user
reports lag and requests bigger gears plus removal of the entire right column.
Next: move animation to composited HTML/CSS layers, enlarge screen occupancy and
keep one CTA with truthful readiness and accessible status. Prior first-pass
captures are interim. [First pass](history/2026-10-11_17-33-06-698716-orchestrator-large-loading-gears-first-pass.md).
Direct work only, per user request. Preserve concurrent backend state below.

---

# Current follow-up: original camera zoom restored; loading screen refinement active

The user requested direct work without subagents. Restored every building's original
full-building focus fit distance, while retaining the new viewing angles and screen-wide
outward return. Removed radial shortening and Stern's 94.36 m distance override;
Stern retains its rotunda target. Height factors now derive orientation only.
Direct verification: numerical camera 20/20, production Chrome 23/23, build and diff
check passed. Evidence is in evidence/m19-building-views/restored-zoom/. No independent
specialists ran this follow-up. [Latest pass](history/2026-10-11_17-22-39-173959-orchestrator-original-building-zoom-restored.md).

Now implementing the user's loading screen request: match the large gears and moving
text from https://techatnyu.vercel.app/, with loading phrases instead of FAQ text.
Original entry/error/readiness behavior must remain truthful. Prior states below are
historical where superseded; ongoing backend work is preserved.

---

# Latest completed map milestone: M19 building views and screen-wide return

Implemented eight screenshot-derived views. Stern is lowered 25%; Courant, Bobst,
Kimmel, GCASL, Paulson, Leslie eLab and Silver Center are lowered 20%. This map
uses Y for height. Each factor applies once to the camera offset above its target,
keeping the original horizontal offset. Stern uses the rotunda target `[85,25,193]`
and original distance 94.36 m (about 90 m after lowering). Its broader multi-wing
root is intentionally cropped, with some foreground overlap; selection still
covers the complete building and details.

The last image labeled Stern is interpreted as Silver Center after optional
clarification went unanswered. This assumption was stated to the user and the
first Stern view was retained. All other geometry, palettes and model coordinates
are preserved. Window capture shares the existing canvas wheel gesture state:
outward scrolling anywhere during focus returns to the saved overview once;
tails do not restart it; unrelated overlay scrolling and loading remain native.
Off-canvas return preserves map hover coordinates.

Modules: `src/building-views.js` owns view profiles; `camera-focus.js` applies the
profile and existing spring/overview snapshots; `map-interactions.js` owns shared
wheel capture, guards and disposal; `main.js` supplies the window target. Tests and
current captures live in `tests/building-view-browser.mjs` and
`evidence/m19-building-views/`. No backend source, model assets, hosted services or
publication were changed by this map task. Concurrent M18 work remains below.

Verification: numerical camera 20/20; independent input 16/16; stable production
Chrome 23/23 on desktop and portrait, load 3248 ms, no errors or failed requests;
source geometry/palette hashes unchanged; independent evaluator accepted; Vite
production build passed with its existing large-chunk advisory; full diff check clean.
The Vite development run interrupted by concurrent reload is retained as invalidated
history and superseded by production evidence.

Limitations: screenshot angles are estimates; Stern and Silver have foreground
overlap. Apple Events initially read the user's tab after its setting was enabled,
but that window became unavailable to control before final checks. Final verification
used a separate installed Chrome instance. Physical touch/trackpad are untested.

Latest passes: [tester final pass](history/2026-10-11_17-16-11-131085-tester-eight-building-production-chrome-accepted.md), [evaluator final pass](history/2026-10-11_17-16-11-131374-evaluator-eight-building-review-accepted.md), [orchestrator final pass](history/2026-10-11_17-16-11-131484-orchestrator-building-views-final-integration.md).
Evidence: [production Chrome results](../evidence/m19-building-views/browser-results.json),
[tester report](../evidence/m19-building-views/tester-report.md).

Next: user feedback on the saved views or last-image identity. M19's bounded
implementation is complete; prior unfinished backend work is preserved below.

---

# Current milestone: M18 automatic Discord discovery and time-tier storage

Tech NYU assistant is primary. User authorized discovery of bot-accessible text channels/threads, inherited category/channel exclusions, clearing and rebuilding the Discord archive, and storing daily/weekly/monthly groups with no images or embeddings. All code remains uncommitted on codex/dev; preserve earlier work.

M17 live launch succeeded: guild1203562091500404776, channel1203562091982622814, 10,212 distinct originals backfilled from Discord epoch, earliest2024-02-04. Supabase runtime verified, original rows/checkpoint/access catalogue independently checked. Railway service discord-archive in project tech-nyu deployed successfully, hosted one-shot sync passed. Daily cron had been configured but its first scheduled run was not observed.

**Collection paused:** Railway cron cleared via authenticated public API and CLI readback confirms cron=null,nextRun=null, latest deployment SUCCESS/stopped=true. SQL003 applied after independent acceptance; authorized reset deleted10,212oldoriginals andverifiedzeroarchives/checkpoints. Operator/config/grants preserved. Manual policy nowactive revision3 with4category+1channelexclusions; scheduledRailwaycollection remains off. Discovery complete:266metadata nodes/216eligible sources/30excluded/9denied,175pages. Full history collection complete:108828originals,216successful sources at2026-10-11T21:02:08.697Z. Grouping now published:779groups/108828exclusive members, independently verified.004applied as20261011213945. Optimized direct publication takes~35–37seconds; 005applied as20261011214737; actualruntimeAPI classification succeeded43218ms underfunction-only60sbudget; privatearchives withoutbotmembership/managepermissions inaccessible. New policy will default paused, revisions guard in-flight writes and reset, no source reader grants automatically created.

Blacklist categories: 1461311169586266165,1533053124606955600,1203562092213305371,1203562092376891445. Blacklist channel1203562091982622819. Descendant channels/threads inherit exclusions; unknown ancestry fails closed. Images skipped; no image downloads. Embeddings and AI summary generation deferred until provider choice. Groups preserve text originals and links; last rolling7days group daily in America/New_York, older current month group Monday-based weeks, prior months group monthly, recent-window precedence across month boundaries.

Architecture: existing Hono/Supabase archive plus service-only guild policy, discovered hierarchy, checkpoints and memory buckets. Planned discovery includes active/public archived/joined private archived accessible threads, no automatic thread joining. Scoped reset preserves operator/config/source ACL and unrelated knowledge tables. Production member auth remains unresolved and protected routes fail closed. Hosted local migration prefixes differ from MCP-applied versions; do not replay db push blindly.

Discovery coder completed49/49 scoped checks; SQL/store coder completed; root94/94 Discord and33/33 assistant suites passed. Independent addedcoverage/evaluator active. [Storage pass](history/2026-10-11_16-52-53-253520-coder-discord-policy-memory-storage.md). [Discovery implementation](history/2026-10-11_16-51-28-977390-coder-discord-discovery-implemented.md). Root owns sync/CLI integration, hosted changes and journals. Latest root integration: [policy CLI hooks](history/2026-10-11_16-49-12-156660-orchestrator-discord-policy-cli-integration.md). Prior planner contract: [M18 planner contract](history/2026-10-11_16-44-44-244153-planner-discord-discovery-memory-contract.md). Live launch evidence: [storage review](../evidence/m17-discord-launch/live-storage-report.md).

Local replacement accepted: independent132/132 tests and API build; evaluator99/99 and sanitizer probes accepted. Latesthosteddiscovery [completedinventory](history/2026-10-11_17-02-09-848834-orchestrator-discord-live-discovery-complete.md). Previous [policy and scopedreset](history/2026-10-11_16-56-37-686927-orchestrator-discord-hosted-policy-and-reset.md). Prioraccepted [local integration](history/2026-10-11_16-55-57-180579-orchestrator-discord-local-replacement-integrated.md). Next: finish the resumable full-history backfill, verify exclusive daily/week/month grouping independently, then deploy and verify the hosted worker before restoring its daily schedule. Earlier snapshots below are historical and superseded here.

Latest preliminary Railway review: [accepted deployment inputs](history/2026-10-11_17-23-57-504585-evaluator-discord-rollout-inputs-accepted.md); actual new hosted run remains pending.

Latest rebuild pass: [history complete; grouping timeout](history/2026-10-11_17-30-06-418010-orchestrator-discord-history-complete-grouping-timeout.md). Railway remains paused until this finding is resolved.

Independent raw archive acceptance: [tester hosted originals](history/2026-10-11_17-30-55-906371-tester-discord-rebuilt-originals-accepted.md), with [exact aggregate evidence](../evidence/m18-discord-memory/live-storage-report.md). Grouping remains pending.

Performance follow-up: [coder004 optimization](history/2026-10-11_17-35-04-202262-coder-discord-memory-publication-optimized.md); equivalent periods and guarded atomic publication locally verified; independent/hosted acceptance pending.

Latest performance finding: [independent skewed-data timeout](history/2026-10-11_17-36-46-482212-tester-discord-skewed-memory-performance-finding.md);004remains unapplied pending correctedplan and retest.

Final performance follow-up locally accepted: [coder pass](history/2026-10-11_17-39-38-283018-coder-discord-memory-window-publication-fixed.md), [tester pass](history/2026-10-11_17-39-38-283351-tester-discord-memory-performance-accepted.md), [evaluator pass](history/2026-10-11_17-39-38-283458-evaluator-discord-memory-performance-fix-accepted.md), [orchestrator pass](history/2026-10-11_17-39-38-283545-orchestrator-discord-memory-performance-integrated.md). Independent134/134checks and APIbuild passed; unchanged skewed108828fixture completes~2–3seconds. New004 ready for hosted apply; earlier candidate timeout is resolved locally, not yet hosted.

Latest hosted pass: [published groups/API budget diagnosis](history/2026-10-11_17-43-54-545730-orchestrator-discord-hosted-group-publication.md); no readergrants/images/vectors; Railwayoff pending005/APIproof.

Latest runtime-budget acceptance: [tester pass](history/2026-10-11_17-47-37-376308-tester-discord-hosted-groups-accepted.md), [coder pass](history/2026-10-11_17-47-37-376720-coder-discord-memory-api-budget-implemented.md), [tester pass](history/2026-10-11_17-47-37-376839-tester-discord-memory-api-budget-accepted.md), [evaluator pass](history/2026-10-11_17-47-37-376933-evaluator-discord-memory-api-budget-reviewed.md), [orchestrator pass](history/2026-10-11_17-47-37-377061-orchestrator-discord-memory-api-budget-integrated.md). Independent136/136checks/APIbuild andevaluatorpass; new005function-onlybudgetreadyforapply. UserauthorizednextLunasummarypasses; authenticatedmodelgpt-6-luna configured, no summariesgeneratedyet.

Latest runtime/rollout pass: [APIaccepted/newdeployment](history/2026-10-11_17-50-28-629210-orchestrator-discord-runtime-api-accepted-and-deployed.md); deployment52696393-5d07-4649-8bde-7c995b6ba151BUILDING, cronoff pendingrealworkerresult. Luna summaryextensionnowauthorized; noDiscordmodelinputyet.

Latest hosted finding/resume: [discoverydeadline andboundedrerun](history/2026-10-11_17-55-14-840740-orchestrator-discord-hosted-discovery-deadline-and-resume.md); old52696393CRASHED afterstrictdeadline; sameimage e5ec96e5 rerunningwith15minutediscoverybudget.

---

# Latest M17 live check: first Discord channel access denied

User created/invited the bot and saved bot token/guild ID locally. Live application authentication and Message Content capability are verified; guild1203562091500404776 is accessible. Selected channel1203562091982622814 returns HTTP403 on channel metadata, so its View Channel permission needs correction before registration/collection. No messages read/stored and no backfill attempted. Runtime Supabase remains previously verified; Railway remains prepared and undeployed with cron off.

User requests using this one channel for now and asks for automatic discovery with a blacklist so future channels/threads need no manual registration. That feature is not implemented/enabled; current explicit-source mode remains. Exclusions should propagate through categories/channels to descendant threads while retaining distinct source access boundaries. Private threads still require bot access. Next: grant bot role View Channel + Read Message History in the chosen channel (check category overrides), retry preflight, then register/backfill. Resolve discovery exclusions before an all-channel rollout.

Latest retry: [channel access retry](history/2026-10-11_16-28-37-040931-orchestrator-discord-channel-access-retry.md); preflight still permission_denied and direct selected-channel GET still HTTP403. No history was fetched.

Latest pass: [first-channel access check](history/2026-10-11_16-24-52-647803-orchestrator-discord-first-channel-access-check.md). Prior setup/acceptance below remains historical where superseded.

---

# Current milestone: M17 Discord backfill and Railway launch

User authorized initial full-history Discord backfill using local bot credentials, followed by a new Railway archive service and ongoing daily collection. Preserve M16 memory design/to-do; summary implementation is separate. CLI/runtime/deployment inputs implemented; independent tester98/98 and API build passed; final evaluator accepts bounded local behavior. Explicit server/channel/thread scope and runtime secrets still missing. Both hosted migrations now applied and catalogue/service-role checks verified; no live Discord reads yet.

Railway MCP installed; reads succeed but create_project returns Unauthorized. Fresh supported CLI login works: railway init created tech-nyu (f13799d2-95ff-4d22-9b17-acfce19406ca). Dedicated service discord-archive created (2dad5e78-ff4f-4342-acc3-bf3daba2f3f3) in production environment dfe169c1-46a0-415a-9171-309fc9974ef8; deployment pending. Worker Dockerfile/start/NEVER restart and6nonsecret variables configured; no cron enabled. Supabase public schema was empty before apply; now12service-only tables/12invokerRPCs, RLSforce/browserdenials/vector/schema+sequence grants verified. Hosted MCP migration versions20261011200346knowledge and20261011200348discord_archive differ from local filenames; reconcile history before CLI db push. Do not infer runtime credentials from MCP OAuth.

Latest pass: [local launch accepted](history/2026-10-11_16-11-31-676511-evaluator-discord-local-launch-accepted.md); evaluator23/23+24/24 and API build passed. No deployment or live Discord messages; daily cron remains off. Next: invite/configure bot, provide guild/selected channel/thread IDs and token, run initial full history/catch-up, then deploy worker and verify cron.

Latest integration: [hosted schema and service prepared](history/2026-10-11_16-08-45-258129-orchestrator-hosted-schema-and-railway-service-prepared.md); docs/discord-launch.md gives current setup. Ignored .env contains URL/operator UUID provisioned separately as DB admin; user-supplied runtime key is now verified through real PostgREST; sync/list-admin RPCs ready with zero channels. Key securely provisioned into exact Railway service via stdin/skip-deploys; bot token/guild remain absent. Full M17 completion is pending real backfill/deployment/schedule.

Latest review: [hosted migration review](history/2026-10-11_16-03-46-315350-planner-hosted-discord-migration-review.md); independent SQL 9/9 accepted before apply.

Latest pass: [Discord Railway launch contract](history/2026-10-11_16-02-09-949055-planner-discord-railway-launch-contract.md).

---

# Latest pass: Supabase MCP live connection verified

The user requested a connection check only. On 2026-10-11T15:58:22.904190-04:00, this Mac session exposed callable Supabase MCP tools. Filtered CLI inspection confirms the account-local `supabase` registration enabled at `https://mcp.supabase.com/mcp` with OAuth authentication. This is the current unscoped registration, distinct from the historical Windows `tech-nyu-supabase` scoped entry; no configuration was changed.

Live evidence: `list_projects` returned one accessible project, `tech-visualized` (`jssehnrmqhstcrtxulpa`), in organization `cicankbwigcrscspugar`, status `ACTIVE_HEALTHY`, region `us-east-2`. `execute_sql` on that project with `SELECT 1 AS connection_ok;` returned `connection_ok: 1`. Authenticated MCP and a database read are verified. Write capability, hosted migrations, runtime application credentials and integrations remain unverified. No schema/data mutations or deployments occurred.

Active product milestone remains M16 and the prior memory design/implementation state below is preserved. Next development pass can use this verified project identity, while retaining the separate authorization/runtime setup boundaries. Prior statements that this session exposes no Supabase tools are superseded by this check. This was a direct orchestrator check, without independent specialist review.

Latest pass: [Supabase live connection verified](history/2026-10-11_15-58-22-904190-orchestrator-supabase-live-connection-verified.md).

---

# Current state: M16 local archive accepted; memory design saved for next session

Product: Tech NYU assistant with a supporting campus map. M16 adds a separate one-shot Discord REST archive worker in this website checkout, not the Python marketing reminder bot. Changes remain local and uncommitted on codex/dev.

Implemented: admin-selected channels and explicit threads; January 1 2026 New York default backfill; bounded resumable fixed-window scans and outage catch-up; atomic message/page checkpoint transactions; exact string Discord IDs; original JSONB messages and observed revisions with reply IDs/source links; text/date/author search; optional 1536-vector embeddings with matching hash/model/provider; trusted admin membership and source read grants; validated model-selected search tools; standalone /admin.html; server-only environment settings and corrected chat request budgets.

Architecture: existing Hono backend plus Supabase service-only RPCs, raw storage before embeddings, explicit member/source scope on retrieval. Disabled sources immediately disappear from search/backlog. The worker exits at its budget/completion; Railway runs collection and database writes using server environment variables, including DISCORD_BOT_TOKEN. Direct REST collection needs no LLM crawling agent. No Railway job is active.

Latest user-approved memory design (not implemented): last seven days use individual message records; older messages within the current New York calendar month use weekly summaries; previous months use monthly summaries. The rolling seven-day window takes precedence across month boundaries. Retain raw originals for exact questions, audit and source links; summary tiers govern normal retrieval, not destructive retention. Preserve channel/source permissions in every summary, with source message IDs, dates, people, decisions, rooms and links. One message or summary JSON record maps to one vector stored alongside it, with deterministic JSON text serialization, model/provider and input hash for re-embedding. Exact IDs/authors/dates remain separately filterable. Calendar-week boundary and partial-week/month rollover handling still need a concrete implementation contract.

Implementation gap: current message embeddings are optional/off by default and encode extracted content/embed text/attachment names, not canonical JSON serialization. Weekly/monthly summary tables, generation, vectors, rollover and retrieval routing do not exist yet. The latest agreement supersedes the earlier text-only-first recommendation for the planned memory layer; it does not mean embeddings have been enabled or summaries generated.

Verification: independent 75/75 integrated tests, zero skips/failures; five real Chrome fixture checks including desktop/mobile/denied state; actual isolated PostgreSQL/pgvector migration/transaction/ACL execution through PGlite. Evaluator accepts local implementation. API syntax/import build and Vite production build pass; Vite retains its existing large map-chunk advisory. Unconfigured worker is truthful no-op. git diff --check clean.

Pending live launch: Discord guild/channel choice and Message Content privileges; runtime bot/database/model credentials; authorized hosted migrations/PostgREST verification; real member identity/channel visibility policy; Railway deployment/scheduler. No live source read, historical backfill, hosted schema/data mutation, model call or deployment occurred. Production protected routes deliberately fail closed. Daily REST overlap does not fully detect old edits/deletions. Full-day or historical summary generation and event-date extraction are later work; limited search results cannot establish exhaustive activity.

Setup and boundaries: docs/discord-archive.md. Test evidence: evidence/m16-discord-archive/tester-report.md. This Mac session followed the user's shared MCP configuration policy; Supabase shared registration and Codex OAuth succeeded, but live database tools are not exposed and the authorized organization remains unverified. Developer OAuth is separate from runtime credentials.

Deployment target instruction: use the Supabase organization authorized through MCP OAuth. Its identity/projects remain unverified because Supabase tools are not exposed in this session. On reload, enumerate accessible organizations/projects and identify the intended database project before applying the ordered knowledge and Discord archive migrations. Do not infer that organization selection identifies a unique project. Runtime credentials are separate from MCP OAuth. Channel access policy, production auth and runtime secrets remain pending.

Latest pass: [memory design and reload handoff](history/2026-10-11_15-55-48-172265-orchestrator-discord-memory-design-handoff.md). This documentation-only pass inspected implementation and Git state; prior 75 tests/five browser checks/build evidence remain prior-pass results, not tests of the new memory design. All previous records below are historical and superseded where this snapshot states a newer result.

---

## M16 orchestrator pass

Integrated Hono admin/search routes, validated model-selected retrieval planning, optional semantic query encoding, server runtime and one-shot worker entry, admin page/client/CSS, frontend request budgets, package/lock/env settings and setup docs. npm run build:api and npm run build passed; unconfigured worker injected env={} returned truthful storage_not_configured no-op. Inspected test evidence and desktop browser capture; git diff --check clean. Removed the new legacy Railway JSON template after current primary docs showed deprecation; future service dashboard/IaC instructions preserve cron/start/build/no-healthcheck settings. Updated source/schema/root/docs guides and current backend notes. Changes remain local/uncommitted on codex/dev. No deployment, hosted schema apply, live archive/backfill or paid model call.

Latest pass: [discord-integration-and-handoff](history/2026-10-11_15-47-00-802520-orchestrator-discord-integration-and-handoff.md).

## M16 evaluator pass

Independent read-only evaluator inspected source, SQL, fixtures and browser evidence; accepted local implementation with no material unresolved correctness/privacy/runtime finding. Independently ran 33 assistant and 42 Discord tests plus API build and OpenAI-compatible/Anthropic tool-planning mocks. Confirmed future-backfill, source identity, access, provenance and resumable checkpoints. Live Discord/Supabase/PostgREST/model/Railway and production identity remain unverified; summaries and complete historical edit/deletion reconciliation deferred.

Latest pass: [discord-local-implementation-accepted](history/2026-10-11_15-47-00-802101-evaluator-discord-local-implementation-accepted.md).

## M16 tester pass

Independent tester wrote six Discord suites and Chrome admin checks. Integrated command node --test tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs tests/discord*.test.mjs passed 75/75 with zero failures/skips. node tests/discord-admin-browser.mjs passed five real Chrome fixture checks with desktop/mobile/denied captures. Actual embedded PostgreSQL/pgvector migration and RPC role tests passed. Fixed and retested mode mismatch, extension schema grants and null vector provenance. Evidence: evidence/m16-discord-archive/tester-report.md and test-output.txt/browser-results.json. No live source/model/hosted DB or deployment.

Latest pass: [discord-local-acceptance](history/2026-10-11_15-47-00-801196-tester-discord-local-acceptance.md).

## M16 focused correctness fixes

Focused coder fixes add explicit non-null vector model/provider/hash checks, grant service_role usage of the vector extension schema, reject future backfill windows, and validate message source/guild/channel/author/timestamp/link identity. Parent inspected these changes; coder reported 37/37 then-current Discord tests including local PostgreSQL/pgvector fixtures. Independent final regression tests and evaluator review remain pending. No live cloud/source/model operations.

Latest pass: [SQL and identity fixes](history/2026-10-11_15-43-28-998841-coder-discord-sql-and-identity-fixes.md).

## M16 coder pass

Coder implemented five modules under server/discord plus info.md and local migration 202610120002_discord_archive.sql. Parent inspected source, exported contracts and SQL. Syntax checks passed; coder reported 28/28 current Discord fixture tests. Independent testing remains underway. Backward fixed-window scan, atomic progress/watermark, explicit channels/threads, observed JSONB revisions, raw-before-embedding, hash/provenance and source grants are implemented. No historical deletion/full edit reconciliation or summaries; no live calls/deploy.

Latest pass: [discord-worker-and-local-schema](history/2026-10-11_15-40-50-316985-coder-discord-worker-and-local-schema.md).

## M16 tester pass

Independent initial client/embedding pass: 6/6 tests passed for exact string IDs, server credentials, bounded rate-limit retries, permission/error handling, and disabled embedding/dimension/provenance checks. Worker/SQL/API/browser tests were pending at this checkpoint. Test ownership stays with tester; no live calls.

Latest pass: [discord-client-embedding-fixtures](history/2026-10-11_15-40-50-316128-tester-discord-client-embedding-fixtures.md).

# Current M16: Discord archive and retrieval

The user resumed implementation on 2026-10-11. M16 adds a separate one-shot Discord REST worker to the website backend, admin-selected channels, a January 1 2026 New York backfill, daily incremental synchronization and original-message JSONB storage. Text/date/author retrieval is primary; embeddings are optional. Keep originals and source links rather than replacing them with summaries. Weekly/monthly derived summaries are a proposed later layer, not running work.

Planning is accepted; implementation/testing/review are pending. No cloud migration, live Discord read, model call or deployment has occurred. Production member authentication and channel visibility policy remain unresolved and must fail closed. The latest Mac session uses the user-provided shared MCP policy, superseding the historical Windows-specific override for this session; shared Supabase registration and OAuth succeeded, but current tools expose no live Supabase database calls.

npm install --ignore-scripts succeeded (44 packages, zero reported vulnerabilities), refreshing the stale Hono lock; application verification is pending. Existing M15 request/retrieval limits are still open until fixed and tested.

Latest pass: [Discord archive contract](history/2026-10-11_15-33-31-371376-planner-discord-archive-contract.md).

---

# Current milestone and session handoff

## Latest: dev snapshot published

Snapshot commit 3abac9e (180 files) was pushed successfully to origin/codex/dev, with upstream tracking configured. The previous Git permission/network blocker is resolved for this pass. Application acceptance and M15 open findings remain unchanged; no runtime tests were rerun for this Git-only request. See [publication record](history/2026-10-11_14-29-20-978625-orchestrator-dev-snapshot-published.md).

## Prior: development snapshot requested; backend work stopped

The user changed the objective to document and commit/push the current work to a dev branch. No further backend implementation or Supabase retry is part of this pass. Existing map work through M13 is preserved, including landmark refinements, vegetation, camera navigation, atmosphere, resource optimization and explicit loading-screen entry. Existing evidence records distinguish source checks from unverified browser appearance/performance.

M15 source now includes the assistant launcher/panel after map entry, building context, streaming chat transport, Hono routes, OpenAI-compatible and Anthropic adapters, server-side environment configuration, scoped knowledge repository, seven-table local SQL migration, no-op daily-worker boundary and Railway configuration. This is an incomplete scaffold, not an accepted or deployed backend.

Verification: latest targeted run reported 32 passed, 1 skipped, 0 failed. Hono integration is skipped because dependencies could not be installed. Registry resolution failed; package-lock.json does not yet include the new Hono dependencies. Production build, actual Hono transport, PostgreSQL migration/ACL behavior, live model/database connectivity and browser integration are unverified. Production member authentication intentionally fails closed; no live source connectors or scheduler exist.

Open review findings: client chat history can exceed the server's 16,000-character/32,768-byte request budgets; an accepted chat question longer than 500 characters exceeds the retrieval query limit. These need implementation and regression tests in a later authorized development pass. No fixes are claimed here.

Supabase: user reports completing setup/auth; CLI verified the scoped entry enabled, with auth_status unknown. No callable database tool or authenticated read-only database response was available. Migration remains local and unapplied. Developer MCP OAuth is separate from runtime service credentials. Nonsecret connection inventory lives only in AGENTS.md; local MCP connection files remain ignored.

Current Git destination is codex/dev unless an existing suitable dev branch can be verified. The earlier inital-map-buildout snapshot request is superseded. See docs/assistant-backend.md for setup boundaries and remaining work; Git completion is recorded separately only after observed success.

## Historical M14 setup attempt (superseded by current status)

User explicitly overrode shared-sync policy: install normally on Windows, ignore MCP-only connection configs, inventory only in AGENTS.md. Exact project restriction retained. Narrow .gitignore rules verified; no MCP-only file was tracked, so no index removal needed. Existing tracked .codex agent config preserved.

Normal account-local Codex registration attempted but Windows denied writing user config (os error5). Named lookup confirms no server installed; OAuth not started or verified. This is a genuine filesystem denial, not the superseded missing-sync requirement. Next: run the documented normal CLI add/login in a terminal with access to Codex user config, then verify a read-only project response. See AGENTS.md inventory and docs/supabase-mcp-setup.md.

Architecture remains assistant-first, map/history secondary; Hono on Railway and Supabase Postgres+pgvector planned. Daily sync/summaries retain originals/links/permissions; no weekly briefing. Initial Discord bot/Drive read-write design; no Drive writes now. Luma/Miro deferred, no Mural. Model provider/member auth unresolved. No backend/cloud implementation performed.

## Latest: M13 explicit loading screen

Implemented opaque black loading page only, Tech Visualized title, required status, small extruded monochrome SVG gear pair spinning in opposing directions while loading, reduced-motion static gears, and white pill CTA. No descriptive tagline. Existing map palette, UI, geometry, camera, sky and vegetation remain unchanged.

Readiness requires all actual124 jobs, balanced nested LoadingManager resources, compileAsync, full initial render and two animation frames. Enter stays hidden/disabled until ready and never auto-activates. Explicit nativebutton activation removes inert/aria-hidden, enables controls, focuses canvas and starts continuous rendering. Resource/startup/WebGL/shader/stall errors expose retry; completed-with-failures cannot enter. Retry reloads cleanly; late failures re-gate map.

Independent13/13 state/fake-DOM/source checks and source review accepted, including final gear/pill refinement. No live browser visual, keyboard/touch, network timing or WebGL validation claimed. Existing browser denial/build asset realpath restriction remain; user server untouched. See docs/loading-screen.md and evidence/m13-loading/.

## Latest: M12 resource and frame workload refinement

Integrated exact context geometry compaction, shared materials, frozen static local transforms, zero-copy hover views, cached/coalesced picking and bounded runtime frame diagnostics. Retained geometry bytes fell from69,737,778 to52,479,390 (24.75%); full124-job offline scene and source hashes match. All11hovercases add zero geometry-buffer bytes. Selected buildings now lift on hover; non-Bobst average target glow opacity reduced25%, Bobst unchanged.

Independent memory5/5,presentation16/16 and input12/12 checks pass; root camera20/20 passes. Research record is docs/map-performance-research.md. Independent evaluator accepted source/resource implementation with no material defect. Browser/GPU/FPS and live zoom-out/appearance acceptance remain pending denied access; production build remains blocked by the previously recorded asset realpath permission. Do not mark live smoothness fixed from offline results. User server and original asset files untouched. No further Git work is part of this optimization pass.

## Current accepted implementation through M11

M0-M7 initial map is committed as8007790 on inital-map-buildout. M8 onward is local. M8 adds selectable Global Center beside Kimmel, source checks12/12 and user appearance approval. M9 makes the map unobstructed, removes labels and implements source-inspired hover glow with unchanged architectural colors. Camera starts at target[74,12,116], azimuth-172degrees, distance434.2943200101; overview tilt0.00688542069 to0.84345299301. Focus allows65degree front views and78degree orbit. Controls preserve free orbit and pan bounds.

M10 integrates72trees and117shrubs across21eligibleparkparts as four merged meshes/17,136triangles. All53sourceparkparts audited against246actualsceneexclusions; eight independent checks passed. Source exports remain untouched.

M11 shares analytic sky/fog color with stable dithering. Outward focused scroll reverses to the saved pre-focus overview; building switches preserve it, manual drag/multitouch clears it, repeated return events do not restart it. Ordinary wheel deltas are preserved and settle at fixed levels. Reset clears selection/hover. Lipton and Union Square context use pale neutral materials. Restored omitted25UnionSquareWest(Carlyle) and235ParkAvenueSouth exports at identity with neighboring tile geometry preserved. Camera20,input9,presentation16,Union geometry16 checks passed before M12 input optimization. Live shader, motion and screenshot fidelity remain unverified.

Historical snapshots below are retained as context; current truth is above and in milestone folders and append-only pass history.

# Current milestone and session handoff

## Product and status

Local Vite/Three.js NYU Washington Square campus map. M0–M5 accepted; M6 adds
roads, sidewalks, park paths and mapped park/land-cover polygons. Final M6 review
is underway after ten passing test groups. No deployment or remote push.

## Current implementation

110 city tiles, ten selectable landmarks, detailed Paulson/Kimmel/Silver Center/
Leslie, Gould planting, and color-preserving Courant/Stern window details.
Silver Towers use restored original city context; Bobst remains unchanged.
Original source GLBs are preserved. Palette proposals remain separate docs pages.

M6 uses an attributed offline OSM snapshot in campus-assets/data/streets-parks.json.
Exact equirectangular origin is lat40.73082/lon-73.99733; arch anchor matches within
0.001 m after rounding. Snapshot has4,830 ways and564 park/cover parts with241holes.
Renderer accounts for1,065 roadways,3,696 walking ways and69 omitted grade-separated
ways. Most widths are inferred from tags/class, not surveyed curb dimensions.

src/streets.js uses millimeter integer polygon unions/differences for coherent
intersections, sidewalks, curb faces, paths and entry grades; src/parks.js clips
land cover around roads, paths, buildings and the existing fountain. Matching
surfaces are merged; original park-grass model is omitted. Existing scenery trees,
fountain, garden and Gould Plaza are retained. Runtime model includes52 tagged
park parts and558 total cover parts within extent, not52 unique named parks.

Run node tools/build-streets-parks.mjs to regenerate the GLB and metadata after
source/renderer edits. Offline bake takes ~13seconds; runtime loads one16.6MB GLB,
10merged meshes/230,451triangles rather than computing Boolean polygons in browser.
The failed floating-point prototype was replaced by robust integer Clipper; its
pathological StrictlySimple postpass was removed, preserving all selected ways.

Initial camera distance240.9752133m and free rotation remain. Target bounds now
X[-780,780], Z[-780,970] with a~180m inset from loaded extent, allowing outer parks
at close zoom. Zoom15–700m. Gould Focus raises pitch to reveal the low courtyard
while preserving azimuth; subsequent orbit stays free.

## Verification and limits

M6 evidence: evidence/m6-streets-parks/. Initial full run10/10 passes: geographic
projection/anchor, finite bounded bake/fountain clearance, no duplicate old grass,
alltenlandmark interactions, expandedpan, camera/mobile and rendering. No browser
errors or missing assets. Desktop sample~165FPS,421calls/657,444visibletriangles,
2.9second load on RTX5060Ti. Final metadata/rebuild checks pass (3/3); independent visual evaluator accepted M6 with no unresolved material findings.

OSM coverage varies. Underground/indoor/elevated transport is omitted, widths and
3m park-entry transitions inferred. Existing trees may not match every new lawn
boundary. Source-building clipping tolerates only millimeter-rounding slivers,
not material intrusions. Facades and Gould synthetic lower stairs remain prior
photo-informed approximations. Actual mobile hardware/touch performance untested.
No traffic, live activities, calendars, Discord, Drive, database or member assistant.

## Run and next action

Map http://127.0.0.1:4173/; proposals /docs/color-schemes.html (server session15694).
Build npm run build; preview npm run preview -- --host 127.0.0.1. Development:
npm run dev -- --host 127.0.0.1. M6 is accepted; collect user feedback.

Latest pass: [streets-and-parks-first-acceptance](history/2026-10-10_21-05-02-658553-tester-streets-and-parks-first-acceptance.md).

Latest pass: [final-bake-metadata-and-close-view-checks](history/2026-10-10_21-05-59-110085-tester-final-bake-metadata-and-close-view-checks.md).

Latest pass: [streets-and-parks-accepted](history/2026-10-10_21-06-21-685322-evaluator-streets-and-parks-accepted.md).

Latest pass: [street-and-park-preview-handoff](history/2026-10-10_21-06-21-709731-orchestrator-street-and-park-preview-handoff.md).

## Completed M7
User reports asphalt flicker on zoom/pan. Ground-only depth bias and removal of overlapping asphalt under crossing surfaces passed seven browser checks and 48 sampled motion frames, plus independent visual review. The initial global logarithmic-depth candidate was rejected after roof-seam artifacts. Both new configurations measured about 60 FPS, so the difference from historical 165 FPS cannot be attributed to logarithmic depth. Original intermittent flicker was not strongly reproduced in baseline frames; sampled final roads stayed stable.

Latest pass: [road-depth-precision-fix](history/2026-10-10_21-07-52-519243-coder-road-depth-precision-fix.md).

Latest pass: [reject-global-depth-regression](history/2026-10-10_21-14-05-699464-evaluator-reject-global-depth-regression.md).

Latest pass: [ground-only-depth-bias](history/2026-10-10_21-14-05-721037-coder-ground-only-depth-bias.md).

Latest pass: [ground-bias-motion-acceptance](history/2026-10-10_21-14-37-126933-tester-ground-bias-motion-acceptance.md).

Latest pass: [focused-depth-fix-accepted](history/2026-10-10_21-14-37-149435-evaluator-focused-depth-fix-accepted.md).

Latest pass: [road-flicker-preview-handoff](history/2026-10-10_21-14-49-543395-orchestrator-road-flicker-preview-handoff.md).

## Subsequent pass history

- [2026-10-11_12-38-11-233842-planner-gcasl-source-diagnosis-and-scope](history/2026-10-11_12-38-11-233842-planner-gcasl-source-diagnosis-and-scope.md)
- [2026-10-11_12-42-15-550763-coder-gcasl-merged-model-and-integration](history/2026-10-11_12-42-15-550763-coder-gcasl-merged-model-and-integration.md)
- [2026-10-11_12-42-15-595142-tester-gcasl-twelve-offline-checks](history/2026-10-11_12-42-15-595142-tester-gcasl-twelve-offline-checks.md)
- [2026-10-11_12-42-15-603934-evaluator-gcasl-source-accepted-user-appearance-approved](history/2026-10-11_12-42-15-603934-evaluator-gcasl-source-accepted-user-appearance-approved.md)
- [2026-10-11_12-46-45-458966-planner-map-presentation-and-camera-contract](history/2026-10-11_12-46-45-458966-planner-map-presentation-and-camera-contract.md)
- [2026-10-11_12-46-45-504523-coder-presentation-and-effects-integration](history/2026-10-11_12-46-45-504523-coder-presentation-and-effects-integration.md)
- [2026-10-11_12-48-03-683738-tester-presentation-ten-source-checks](history/2026-10-11_12-48-03-683738-tester-presentation-ten-source-checks.md)
- [2026-10-11_12-48-03-727352-evaluator-presentation-source-review-and-reference-steering](history/2026-10-11_12-48-03-727352-evaluator-presentation-source-review-and-reference-steering.md)
- [2026-10-11_12-52-06-577212-coder-adapt-personal-site-surface-glow](history/2026-10-11_12-52-06-577212-coder-adapt-personal-site-surface-glow.md)
- [2026-10-11_12-52-06-634811-tester-source-glow-eleven-checks](history/2026-10-11_12-52-06-634811-tester-source-glow-eleven-checks.md)
- [2026-10-11_12-52-06-646284-evaluator-source-matched-presentation-accepted](history/2026-10-11_12-52-06-646284-evaluator-source-matched-presentation-accepted.md)
- [2026-10-11_12-52-06-660561-orchestrator-presentation-source-handoff](history/2026-10-11_12-52-06-660561-orchestrator-presentation-source-handoff.md)
- [2026-10-11_13-00-01-318668-planner-hover-only-and-front-focus-contract](history/2026-10-11_13-00-01-318668-planner-hover-only-and-front-focus-contract.md)
- [2026-10-11_13-00-01-376789-coder-hover-only-and-navigation-integration](history/2026-10-11_13-00-01-376789-coder-hover-only-and-navigation-integration.md)
- [2026-10-11_13-00-01-391424-tester-hover-and-camera-offline-checks](history/2026-10-11_13-00-01-391424-tester-hover-and-camera-offline-checks.md)
- [2026-10-11_13-00-01-416035-planner-actual-park-greenery-exclusions](history/2026-10-11_13-00-01-416035-planner-actual-park-greenery-exclusions.md)
- [2026-10-11_13-09-07-901867-planner-research-based-camera-and-input-contract](history/2026-10-11_13-09-07-901867-planner-research-based-camera-and-input-contract.md)
- [2026-10-11_13-09-07-950630-coder-deterministic-park-bake-and-runtime-integration](history/2026-10-11_13-09-07-950630-coder-deterministic-park-bake-and-runtime-integration.md)
- [2026-10-11_13-10-12-799082-coder-persistent-spring-camera-and-smooth-exit](history/2026-10-11_13-10-12-799082-coder-persistent-spring-camera-and-smooth-exit.md)
- [2026-10-11_13-10-12-850633-evaluator-resolve-phantom-vegetation-exclusions](history/2026-10-11_13-10-12-850633-evaluator-resolve-phantom-vegetation-exclusions.md)
- [2026-10-11_13-11-48-369476-tester-spring-camera-and-pinch-routing-verified](history/2026-10-11_13-11-48-369476-tester-spring-camera-and-pinch-routing-verified.md)
- [2026-10-11_13-11-48-414846-coder-actual-scene-exclusions-rebaked](history/2026-10-11_13-11-48-414846-coder-actual-scene-exclusions-rebaked.md)
- [2026-10-11_13-12-44-559266-tester-actual-runtime-planting-exclusions-verified](history/2026-10-11_13-12-44-559266-tester-actual-runtime-planting-exclusions-verified.md)
- [2026-10-11_13-12-44-608466-evaluator-camera-and-vegetation-source-accepted](history/2026-10-11_13-12-44-608466-evaluator-camera-and-vegetation-source-accepted.md)
- [2026-10-11_13-12-44-618465-orchestrator-camera-and-parks-implementation-handoff](history/2026-10-11_13-12-44-618465-orchestrator-camera-and-parks-implementation-handoff.md)
- [2026-10-11_13-34-08-406882-planner-atmosphere-reverse-focus-and-context-scope](history/2026-10-11_13-34-08-406882-planner-atmosphere-reverse-focus-and-context-scope.md)
- [2026-10-11_13-36-19-702961-coder-analytic-atmosphere-and-reverse-focus-integration](history/2026-10-11_13-36-19-702961-coder-analytic-atmosphere-and-reverse-focus-integration.md)
- [2026-10-11_13-36-19-781089-coder-neutral-context-and-missing-union-buildings](history/2026-10-11_13-36-19-781089-coder-neutral-context-and-missing-union-buildings.md)
- [2026-10-11_13-38-27-105972-tester-reverse-focus-atmosphere-and-context-checks](history/2026-10-11_13-38-27-105972-tester-reverse-focus-atmosphere-and-context-checks.md)
- [2026-10-11_13-38-27-163269-evaluator-atmosphere-navigation-and-union-source-accepted](history/2026-10-11_13-38-27-163269-evaluator-atmosphere-navigation-and-union-source-accepted.md)
- [2026-10-11_13-38-27-174192-orchestrator-user-refinement-source-handoff](history/2026-10-11_13-38-27-174192-orchestrator-user-refinement-source-handoff.md)
- [2026-10-11_13-38-37-468450-tester-final-neutral-context-integration-check](history/2026-10-11_13-38-37-468450-tester-final-neutral-context-integration-check.md)
- [2026-10-11_13-49-21-273364-planner-memory-and-frame-workload-contract](history/2026-10-11_13-49-21-273364-planner-memory-and-frame-workload-contract.md)
- [2026-10-11_13-49-21-333167-coder-shared-resources-and-hover-integration](history/2026-10-11_13-49-21-333167-coder-shared-resources-and-hover-integration.md)
- [2026-10-11_13-49-52-834506-tester-full-scene-resource-and-input-verification](history/2026-10-11_13-49-52-834506-tester-full-scene-resource-and-input-verification.md)

Latest pass: [resource-ownership-and-input-accepted](history/2026-10-11_13-50-37-613647-evaluator-resource-ownership-and-input-accepted.md).

Latest pass: [measured-resource-optimization-handoff](history/2026-10-11_13-50-37-663283-orchestrator-measured-resource-optimization-handoff.md).

Latest pass: [loading-screen-readiness-contract](history/2026-10-11_13-57-15-708721-planner-loading-screen-readiness-contract.md).

Latest pass: [opaque-loading-and-explicit-entry](history/2026-10-11_13-57-15-769888-coder-opaque-loading-and-explicit-entry.md).

Latest pass: [spinning-gears-and-pill-refinement](history/2026-10-11_13-59-02-392303-coder-spinning-gears-and-pill-refinement.md).

Latest pass: [loading-readiness-and-input-verified](history/2026-10-11_13-59-02-443560-tester-loading-readiness-and-input-verified.md).

Latest pass: [loading-source-and-refinements-accepted](history/2026-10-11_13-59-02-456883-evaluator-loading-source-and-refinements-accepted.md).

Latest pass: [loading-screen-handoff](history/2026-10-11_13-59-02-473789-orchestrator-loading-screen-handoff.md).

Latest pass: [project-supabase-scope-and-sync-audit](history/2026-10-11_14-10-49-705154-planner-project-supabase-scope-and-sync-audit.md).

Latest pass: [scoped-supabase-configuration-prepared](history/2026-10-11_14-10-49-779201-coder-scoped-supabase-configuration-prepared.md).

Latest pass: [supabase-config-structure-validated](history/2026-10-11_14-10-49-792437-tester-supabase-config-structure-validated.md).

Latest pass: [scoped-mcp-preparation-accepted](history/2026-10-11_14-11-18-972515-evaluator-scoped-mcp-preparation-accepted.md).

Latest pass: [supabase-setup-blocker-handoff](history/2026-10-11_14-11-19-166859-orchestrator-supabase-setup-blocker-handoff.md).

Latest pass: [local-mcp-policy-override-and-install-attempt](history/2026-10-11_14-13-09-309962-coder-local-mcp-policy-override-and-install-attempt.md).

Latest pass: [mcp-ignore-and-install-state-verified](history/2026-10-11_14-13-09-363611-tester-mcp-ignore-and-install-state-verified.md).

Latest pass: [local-mcp-policy-and-tracking-accepted](history/2026-10-11_14-13-49-724239-evaluator-local-mcp-policy-and-tracking-accepted.md).

Latest pass: [assistant-backend-and-storage-contract](history/2026-10-11_14-18-04-840918-planner-assistant-backend-and-storage-contract.md).

Latest pass: [requested-buildout-snapshot](history/2026-10-11_14-25-28-721753-orchestrator-requested-buildout-snapshot.md).

Latest pass: [dev-snapshot-documentation-and-open-findings](history/2026-10-11_14-27-26-811449-orchestrator-dev-snapshot-documentation-and-open-findings.md).

Latest pass: [dev-snapshot-git-permission-blocked](history/2026-10-11_14-27-44-038272-orchestrator-dev-snapshot-git-permission-blocked.md).

Git snapshot outcome: normal creation of codex/dev failed writing refs under .git. No commit or push occurred; checkout remains inital-map-buildout. Remote branch lookup also failed with getaddrinfo() thread failed to start. Documentation is saved locally; publication remains blocked.


## Provider discussion — 2026-10-11

User requested cost/quality and agent API advice. Recommendation: evaluate GPT-6 Luna via Responses API against Groq GPT-OSS120B; DeepSeek Flash and Gemini Flash-Lite remain alternatives. This is advice, not a selected provider or implemented change. Hono should own permission-aware retrieval, original source links, bounded execution and scheduling. No paid calls or quality benchmark ran. Existing Chat Completions adapter needs work for Responses; summaries/embeddings remain deferred. Preserve active map/backend priorities above. [Research pass](history/2026-10-11_17-40-58-081662-orchestrator-model-provider-recommendation.md).


# Avatar asset delivery — local files complete

Delivered 26 individual 1254×1254 profile avatars in `output/avatars/tech-nyu-final/`, plus exact prompts, source/hash manifest, labeled overview and `output/avatars/tech-nyu-avatars.zip`. Approved coarse geometry prompt reused across the batch; two requested likeness revisions are included and previous versions retained separately. Primary visual review, source coverage, PNG decode/dimensions and ZIP CRC checks pass. No app integration or Drive upload. An additional requested identity is unmatched and awaits clarification; latest visual revisions are available for user feedback. Active M25/M26 and existing source changes are preserved. [Asset delivery pass](history/2026-10-15_16-19-31-028738-orchestrator-avatar-assets-delivered.md); [milestone guide](avatar-assets/info.md).

Latest avatar update: regenerated the requester avatar using the unchanged approved shared prompt; original retained, overview/manifest/ZIP refreshed. All 26 images verify; hashes confirm the other 25 are unchanged. [Regeneration pass](history/2026-10-15_16-22-35-294735-orchestrator-requester-avatar-regenerated.md).

Avatar placement update: all 26 current individual PNGs also live directly in docs/ with readable person-name filenames. Every copy hash matches its final-output source. [Placement pass](history/2026-10-15_16-31-47-440871-orchestrator-avatars-copied-to-docs.md).

Avatar folder correction: all 26 named documentation copies now live in docs/avatars/; former docs-root copies are removed. Hashes confirm unchanged image content. [Folder organization pass](history/2026-10-15_17-04-10-748833-orchestrator-avatar-folder-organized.md).

## Source registry clarification (2026-10-17)

`knowledge_sources` stores source identity, metadata and status. Miro content is
in `miro_boards`, linked by `source_id`; Discord identities live in the catalogue
JSON of `discord_view_policies` after017. Verified against local schema/runtime,
without a live database query. M33 status and next actions above are unchanged.

- [Registry explanation](history/2026-10-17_13-22-34-264229-orchestrator-knowledge-source-table-explanation.md)

## M27 local readiness and consent

Independent tester passes25 Miro tests and6 shared-access SQL tests. Developer
team and Tech NYU Assistant app created with boards:read only. User confirmed
rotating the accidentally exposed new client secret; subsequent output redacts
credentials. User separately authorized persistent Nyu Team read access and
private local/Railway token storage, restricted by backend to the schedule board.
Miro Add consent succeeded; token provisioning and live verification pending.

- [Readiness verification](history/2026-10-17_13-29-16-095583-tester-miro-connection-readiness.md)

## M27 live activation evidence and compatibility fix

Token stored privately in ignored0600 .env and staged on the existing Railway
worker; exact board/team scope, sync still paused there. Real preflight ready1/1.
Live source UUID6f0cd40c-925c-4cbe-bca7-20017c7f107e added to local shared allowlist
without removing existing IDs; local paired runtime restarted. First snapshot
running. Board reports2495 objects including native tables; mixed item page
currently fails on table metadata although catalogue/overview/tags work. Bounded
partial-coverage fix is assigned; Miro REST does not expose table cell contents.

- [Mixed item plan](history/2026-10-17_13-33-27-259063-planner-miro-unsupported-items-disclosure.md)

M27 mixed-item fix implemented and root-inspected; coder33/33synthetic tests
pass. Independent review and refreshed live mixed-page verification remain.
- [Mixed-page implementation](history/2026-10-17_13-35-52-655712-coder-miro-mixed-items-fixed.md)

M27 independent evaluator ACCEPT:33 Miro,6 provider compatibility and4 actual-schema
provider roundtrip fixture checks pass. Live activation evidence remains pending.
- [Mixed-page review](history/2026-10-17_13-36-37-870728-evaluator-miro-mixed-items-accepted.md)

M27 initial capture still running with renewed lease. Root full listing inventory:
2495objects (37frame,69text,30table,1302table_text,1image,1056sticky_note).
Read-only contingency review recommends waiting for actual result; existing
configurable one-hour maximum is available if20minute default expires. No
concurrency or runtime-budget change has been made.
- [Runtime contingency](history/2026-10-17_13-47-20-360692-planner-miro-initial-capture-runtime-contingency.md)

M27 correction: initial capture FAILED duplicate_or_malformed_item after about
18minutes; no snapshot published, lease released. Actual groups legitimately
span pages and group detail wrappers contain unsafe numeric IDs. Bounded
group-specific merging/raw-page preservation and exact JSON ID parsing are in
progress. MinimumNode22.12 supports exact reviver source. Runtime budget for this
large board is now1hour locally/staged remotely; all other limits unchanged and
daily worker still paused. Table_text originals confirmed metadata-only/no content.
- [Group/ID repair plan](history/2026-10-17_13-52-23-626493-planner-miro-group-slices-and-exact-ids.md)

M27 group/ID repair implemented, root-inspected, coder42/42passes; root requested
a focused optional-total counting correction before independent acceptance.
Structural-first capture and original group page/envelope preservation are added.
- [Group/ID implementation](history/2026-10-17_13-54-19-385798-coder-miro-group-slices-and-exact-id-repair.md)

M27 optional group membership-total guard corrected; coder43/43passes.
IndependentNode22.12 review and real all-group diagnostic are underway.
- [Membership total correction](history/2026-10-17_13-54-56-054880-coder-miro-group-membership-total-corrected.md)

M27 group repair independently ACCEPTED onNode22.12:43/43Mirotests. Real all-group
diagnostic passes41groups/71members; fresh full capture started underNode22 with
1hour cap. Repaired isolated worker deploy initiated with syncfalse, preserving
existing schedule and credentials. No unrelated app code uploaded.
- [Node22 group repair acceptance](history/2026-10-17_13-56-04-658057-evaluator-miro-group-repair-node22-accepted.md)
