# Standard verification and current fixture contracts

Markdown prompt migration, actual-model checks and Contact/Calendar wording corrections are recorded in `milestones/prompt-markdown-2026-10-27/`, `milestones/prompt-markdown-live-2026-10-27/` and `milestones/prompt-clarification-completion-2026-10-27/`. Runtime instructions live in root `prompts/`; deployment status is recorded in the current release milestone.

## Server module locations

Tests import HTTP composition from `server/runtime`, chat orchestration from
`server/chat`, Contacts persistence from `server/contacts`, Treg operations from
`server/treg`, audit code from `server/audit`, and shared/auth/knowledge helpers
from their named folders. Keep test imports and generated constructor-module URLs
aligned with these real files. Model-evaluation source pins must include extracted
helper modules as well as their public entry files; these scripts remain opt-in
and are not executed by the deterministic suite.
The operation endpoint clients also require `server/operation-api`, the fixed
`src/api/operations` routes and the server-owned domain operations. Optional model
harnesses copy/hash these dependencies through the filename-only
`operationSourceFiles` inventory or their existing complete server/tool walk plus
the operation route directory. No module or business call runs while listing files.

Run `npm test` for the deterministic Node/isolated SQL suites and the ten offline
map checks selected by `scripts/run-tests.mjs`. The runner uses four test files at
a time. `npm run ci` adds formatting, linting, file-length limits and both builds;
run builds before package checks. Browser and real-model checks stay separate and
use synthetic business services unless a specific live check is authorized.

Saved-task fixtures use `fixtures/planner-followup.mjs` to expose the saved
catalogue and exact-read methods separately. Tests of full fragment chains request
`detail: 'full'`; the normal compact view includes complete original inputs and
source references but omits retained execution history and historical batch context. A no-change decision is separate from an applied-write receipt
and still needs an explicit exact-version task resolution.

Worker authorization fixtures model the published saved policy and channel tree.
They retain ancestor metadata without giving ancestors or siblings source grants.
Source tools read originals explicitly; map/Calendar operations do not hide reads
of other services. Full queued native Discord originals already supply their
original body; metadata-only Gmail inputs need a separate body read. Source
failures and truncated new observations must not create write authority.

Provider-grouped HTTP route tests import the server-only `src/api` modules.
`runtime-deploy.test.mjs` verifies reachable API inclusion, dormant/worker route
exclusion and rejection of browser modules in server packages. Private historical
model resources have synthetic committed replacements in
`fixtures/planner-resource-regression.mjs`; they are not CI dependencies.

October23 current verification: production-runner actual-model conversations and retained failures are documented in `docs/tool-isolation-verification-2026-10-23.md`. Worker isolation tests now cover ready/partial/failed sync visibility after initial transcript reset and fragmented partial outcomes without completed receipts. Workflow tests cover exact saved-task coverage, changed/expired/removed originals, and omitted queue inputs remaining queued without duplicate checkpoints. Historical private replay/hash-linked experiments are distinct from ordinary current behavior checks.

`contacts-native-fields.test.mjs` covers native Treg wrapper imports through actual client/worker/SQL/store/API/tools, including exact raw/cache preservation, separate lookup email, search/filters, manual clears and duplicate protection. Synthetic provider data only.

## Worker local time, readiness feedback and task-history recursion

`worker-local-time-display.test.mjs` checks derived local clocks across DST, fractions, non-hour offsets and date rollover, explicit missing/invalid zones, all-day precision and unchanged raw data. Actual worker read/list wrappers are covered in integration tests. The real-handler readiness regression proves the fixed safe reason reaches model feedback while all source/task/write guards remain.

`staged-pipeline.test.mjs` independently reproduces old-code pending-task continuation recursion through legitimate refinements, then verifies zero duplicate task bodies, exact chain/task/read-revision/offset/size metadata and lossless source/API/current-log/cache/unknown-chain data. Genuine RED and GREEN are retained separately from two fixture setup errors. Final seven-suite aggregate passes248checks on stable source/test hashes; earlier122compatibility checks overlap and are not added. These are deterministic contracts; unchanged actual-model scenarios remain the separate release gate.

## Worker participation patch

`agent-participation-patch.test.mjs` verifies complete authorized/raw target snapshots, safe endpoint merge, exact timestamp/microsecond preservation, DST/all-day effective-window no-ops, unchanged unrelated facts and private raw-field non-disclosure. `staged-pipeline` checks exact current task reads and person/change bijection. `staged-runtime-integration` exercises the actual handler/adapters/Calendar/shared map service: grouped correct partial attendance, independent blocked work, source/author/identity changes, incomplete or invalid helpers, stale/deleted/expired/changed tasks, unavailable fresh task list, human CAS conflicts, failed/missing write receipts, incomplete/mismatched readback, and fake/stale/cross-cycle proof. A real apply followed by unconfirmed readback may have saved state; tests assert no false receipt/completion, not rollback.

Independent final7-suite aggregate passes248/248, frozen helperb4560891 and integration58c7a73d. This overlaps earlier304/304 broader14-file regression run; do not sum them. Genuine two-direction timed RED(d2db) and DST25-hour all-day RED(4a0a) both pass after minimal fixes. A mislabeled integration capture was GREEN and corrected explicitly; it is not old-code RED evidence. All source/test pins are stable. These scripted checks establish tool behavior; a fresh configured-model seven-case matrix is separately required before release.

## Safe ordinary argument rejection

The worker handler tests reject an entire model turn when any ordinary call has invalid schema or input scope, then permit a later exact authorized retry. Rejected peers do not prepare, execute, activate skills or create proof. Tests cover valid protocol IDs, safe bounded feedback, proposal charging, authorization/lease/audit checks, transcript/history limits and fatal finish/protocol/backend errors. Actual adapters/Calendar/map integration verifies one correct write, no proof from rejected calls, post-write retry and same-version task resolution while preserving blocked work. Four positive cases fail against an isolated exact old handler;145 assigned checks pass and the broader14-file run passes254 including subtests. Counts overlap. These are scripted-provider tests; actual-model behavior is separate.

Task-completion regression coverage in staged-pipeline.test.mjs and staged-runtime-integration.test.mjs verifies that an unchanged task reread keeps a successful current-run action, while changed revisions, old cycles, wrong targets, failed writes, revoked access and newer saved versions remain protected. The new positive cases fail against the original isolated pipeline and pass against the narrow fix. Scripted tests establish the tool contract; configured-model behavior is evaluated separately.

## Conversational RSVP checks

The continued model evaluations use the actual configured model with production runners/adapters and simulated business stores. Private bounded evidence stays under ignored evidence/conversational directories; the rolling milestone records outcomes and strict failures. update-agent-map retains its actual successful-write/receipt and conflict/pending checks; two obsolete prompt-phrase assertions were removed because they already failed on the unchanged simplified worker prompt. No runtime behavior was weakened to satisfy them.

## Further current-rule phase-out

See [the32-case phase-out](../docs/test-phaseout.md) and [current inventory](../docs/test-suite-inventory-after-phaseout.csv). Prompt wording, unused fallback injection and overlapping catalogue/constant checks were retired; actual orchestration, write receipts, permissions, cancellation, partial evidence and historical SQL remain. Real Miro cases verify guide delivery in both prompt phases. The source-compaction test checks actual size reduction and lossless data rather than an old total-prompt percentage.

## Worker tool-call budgets

`agent-call-limits.test.mjs` exercises both provider HTTP formats with16worker
calls, all16paired results on the next request, and rejection of17calls. Ordinary
chat still rejects9calls and oversized native history. The actual handler runs
63ordinary actions plus finish in each of two independent64-call stages, reports
128calls without exposing source data in progress, and leaves untouched tasks intact.
A65thcall or an overflowing reply performs no extra writes; failed calls consume
budget without successful receipts. Overflow attempts remain counted in the run
records. These are scripted-provider/synthetic-store checks, not real-model or
live-source outcomes. Progress privacy and bounded reporting remain covered by
`automation-progress.test.mjs`.

## Applied test cleanup

The [cleanup report](../docs/test-suite-cleanup.md) and [after-cleanup inventory](../docs/test-suite-inventory-after-cleanup.csv) record current test structure. Old milestone browser/capture/planner wrappers were removed; useful asset and actual-pointer behavior is consolidated in the current map tests. Historical SQL fixtures remain. Earlier dated acceptance paragraphs below describe their original runs.

## October 22 repository test audit

See [the audit](../docs/test-suite-audit.md) and [per-file counts](../docs/test-suite-inventory.csv) for the complete dated inventory, historical versus current coverage and cleanup recommendations. No tests were removed by the audit. Standalone browser/model/geometry harnesses are counted separately from registered Node cases.

## Plain saved-task reads

`plain-task-cache-read.test.mjs` verifies that catalogue construction,
`read_pending_task` and defer bookkeeping use saved task rows and local source
scope, without calling old live source/reference validators—even when those
callbacks throw or never complete. A 200-task manifest performs no such calls;
full fragmented task contents remain lossless and read-only tasks keep their
original contents and timestamps. Wrong scope, expiry, malformed bindings,
unknown/mixed input IDs and unread task IDs cannot manufacture task authority.

Production adapter checks block every live source/reference/Calendar dependency
while cached reads/defer succeed. Ordinary tools afterward still enforce current
access and identity. Scripted actual-handler integration reads a saved task, lets
the model choose the normal Discord tool, receives an unavailable-source error,
and verifies that a subsequent Member Plans write is denied and the task remains.
Exact completed-outcome checks, version conflicts, leases and failed-tool feedback
remain covered by staged pipeline/runtime and pending-task SQL tests. All providers,
source data and storage are synthetic; no live model/source calls occur here.

## Planner tool failure continuation

`agent-tool-error-continuation.test.mjs` exercises the actual worker handler with
scripted models and memory stores. Returned denials/conflicts/not-found/unavailable,
tool-local aborted/stale results, thrown errors, null/cyclic/non-JSON and oversized
results become bounded `tool_error` feedback with the original call ID. Failed
bodies and exception secrets never reach model feedback, retained task history or
operational records. Successful sibling calls continue; failed writes receive no
success receipt and a retry of the same action can succeed.

Actual OpenAI-compatible and Anthropic provider serializers preserve matching
failed/successful tool-result IDs. The real staged task resolver refuses to count
an error as a completed task. Current authorization loss, queue lease/receipt loss,
caller cancellation, overall deadlines and required audit failures still stop the
run. Existing phase/call limits remain bounded. `agent-automation`,
`agent-staged-handler`, `model-audit-integration`, `update-agent-map` and
`staged-runtime-integration` retain these boundaries while testing model continuation.
`automation-progress` and `tool-diagnostics-integration` also verify a failed tool
keeps its safe failure progress/dispatch record while the next model turn continues;
invalid prepared arguments still stop before tool dispatch.
All source/model/HTTP responses are synthetic; this suite performs no live writes.

## Discord request-local image context

`discord-chat-images.test.mjs` exercises the production Discord REST client,
current source/policy retrieval, context loader, private bridge, shared chat runner
and provider serializer against synthetic HTTP responses. Both planning and final
answer payloads receive bounded PNG/JPEG/WebP bytes in the last user message,
with the original question preserved and exact message provenance in separate
system metadata. The native text-only tool-turn path is not selected.

Checks cover trigger/old direct reply/recent priority, attachment deduplication,
four files, exact 5 MiB files and 10 MiB aggregate limits, strict CDN identity and
query validation, unsupported bodies, MIME/signature/size failures, ignored-abort
fetch/body deadlines and late response cleanup. Failed signatures and failed body
streams still consume the shared 10 MiB download budget, so rejected images
cannot unlock repeated full-size downloads. Source, policy and audience
withdrawals discard images before inference. Metadata injection, malformed names
and oversized recent text cannot corrupt the remaining valid context. Actual
adapter/remote/bridge follow-ups retain text only; model audit arguments, system
metadata, output records and transport logs contain no uploaded bytes or signed
CDN URLs. These fixtures verify protocol, permissions and data handling; real
model interpretation and hosted rollout require separate evidence. No live model
call, source read, message post, business write or deployment occurs in this suite.

## Timed Calendar batches and bulk corrections

`chat-calendar-batch.test.mjs` additionally verifies26Tuesday/Thursday timed
instances with exact New York hours across the November DST change, canonical
offset input, invalid/ambiguous local clocks and refusal to duplicate a known
all-day version. `chat-calendar-bulk-update.test.mjs` repairs26existing all-day
events through fresh hidden revisions while preserving IDs and human fields.
Its fake Google server recursively merges PATCH objects, requiring explicit null
clears for opposite date/dateTime representations. Reverse conversions, conflicts,
unsupported events, access denial, partial failures, cancellation, retry and safe
25-item title-query pagination remain covered. An actual native-provider HTTP
chain follows two pages inside one list call, then one bulk update, with26saved-timing receipts and
content-free audit counts. All network/provider responses are synthetic.
Verbose-event coverage checks bounded partial full-mode evidence, then
uses identities mode to retrieve26events in two backend pages and repair them
in one native bulk operation. Compact listings omit1800-character descriptions;
fresh full event reads and PATCH preservation retain every human note. Unknown
modes fail before OAuth, and the existing default full behavior remains checked.
`calendar-pagination.test.mjs` exercises stable query/window/page parameters,
empty pages, duplicate identities, malformed/repeated cursors, late failures,
account/access revocation, shared60second cancellation and20page/200event/UTF-8
output ceilings. Model schemas reject cursors while the low-level single-page
client remains compatible. Native completed scans recheck access before release.
Worker Calendar writes require complete unfiltered full-mode coverage of the actual
target date. Deterministic projection owns rolling windows and pagination; unrelated
messages do not force model scans or mechanical repair tasks. No source/provider writes run.
Single-create HTTP checks also verify the production client's saved start/end,
timezone and exact Calendar URL survive both follow-up planning and final context;
existing provider stubs without optional timing fields remain supported.

## Source-backed all-day Calendar batches

`chat-calendar-batch.test.mjs` runs the production Calendar client against
synthetic HTTP/OAuth storage, checking12-row and50-row batches, exact date-only
exclusive ends, past years/leap dates, paginated duplicate checks with unchanged
windows, cached dates, existing/duplicate/ambiguous rows, retries, human-field
preservation, schema/grant denial, partial failures and abort receipts.
An actual native provider/HTTP chat chain reads a first-sheet CSV with eligible
rows beyond the1800-character citation excerpt, skips its unassigned rows and
creates the clear entries in one backend batch call. Structured Drive text stays
bounded at12000characters with honest first-sheet/truncation flags. Autonomy
checks verify pending constraints and clear-request policy; scripted extraction
does not establish arbitrary-model semantic behavior. No live source writes occur.

## Opaque Drive pagination cursors

`google-connector.test.mjs` reproduces a successful five-file provider response
rejected solely because its528-character cursor contains tilde/exclamation.
Search/list tests cover every printable ASCII punctuation byte, the2048-character
boundary, exact URLSearchParams continuation and shared schema/backend rejection
of whitespace, controls, malformed types and oversize before OAuth. Malformed
provider cursors retain incomplete coverage. Narrow schema tests preserve regex
safety. `chat-drive.test.mjs` follows real native provider turns through both
top-level search and nested directory cursor normalization into exact continued
Google requests. All provider/Google responses are synthetic; no live data is read.

## Native chat tool execution

`chat-tool-stream.test.mjs` checks actual Google empty searches and Miro empty
catalogues through planned and native chat: progress completes, original `empty`
results reach models/audit unchanged, and permission/timeout/invalid errors fail.

`chat-native-tools.test.mjs` runs the production provider against synthetic HTTP
responses through the real chat runner and private Discord bridge. It verifies
Drive skill activation leaves the unexecuted proposed turn out of the transcript,
preserves prior receipts, allows discarded IDs and rejects committed ID reuse.
Mixed writes wait for a fresh plan; only actual executions emit tool progress/audit.
It also verifies
assistant/tool call-ID pairing, stable catalogues, historical refusals alongside
current capability/attempt/receipt facts, unknown/invalid/deferred/duplicate calls,
thirty-round and thirty-execution caps, cancellation and actual execution audit counts.
Paired proposals stop after fifteen rounds; single-call continuations can reach
round thirty. A skipped duplicate leaves unused execution budget without extending
the round limit, and three consecutive stalled rounds still stop early. The
frontend stream tests accept every progress ID through tool-30 and reject tool-31
and malformed IDs. Drive
skill activation resolves every skipped native call before replanning. Quoted source content remains evidence for the model, rather than an instruction
to mutate the map. Backend identity, field and revision checks remain independent.
Full26-tool native requests, the33-tool bound and existing image/PDF multimodal
fallback are checked. These scripted provider responses verify protocol and
backend behavior; actual-model semantic decisions require separate evidence.
Final-answer tests verify execution has ended, successful receipts and exact
Calendar URLs reach the answer request, saved outcomes require confirmation
instead of future-work promises, and failed/unattempted actions remain distinct.
Both phases focus on the latest user request rather than replaying old complaints.

## Calendar conversational followups

`chat-calendar-followup.test.mjs` runs actual website and Discord chat runners,
the request-local Calendar adapter and the production Calendar client against
synthetic OAuth/HTTP storage. It verifies the colloquial first add request,
immediate same-user confirmation, combined add/cancel actions across planning
rounds, exact current-request cancellation reads, human-field preservation and
truthful partial-failure receipts. Cancellation-first checks inspect actual
mutation attempts/receipts and continue to create after cancellation. History,
quoted/reported/negated text and source-injection fixtures verify stable tools and
unchanged context for model interpretation; scripted providers do not establish
semantic refusal. Google/writer revocations still prevent actual writes. An actual Discord adapter chain verifies retained same-user
reply history and isolation from another member. No live model, Calendar write or
Discord post occurs; final generated language and hosted rollout need separate
evidence.

`stable-tool-catalogue.test.mjs` compares complete Calendar/map definitions
across sixteen request shapes in both actual transports, missing history and
Google grants. It also verifies interpretation/source/receipt prompt policy.
Calendar semantics are decided by the model; valid provider-selected mutations
are not blocked by request wording. Backend Calendar grants, fixed targets,
schema, fresh revisions, idempotency and stateless denial remain tested, as do
ordinary map identity, revision and source checks. Actual-model
semantic scenarios are separate orchestrator evidence. A four-round actual-runner
Gmail search/read then Calendar check/create regression verifies source workflows
continue through the write; global round/call caps and dedup remain checked.
Mechanical stall checks allow two duplicate-only replans, stop on the third
consecutive stalled round and reset on a new actual call. They cover recovery
to the pending cancellation after two duplicate creates with a constant catalogue.
Calendar coverage tests return results to the model before it elects to finish;
the map duplicate test verifies a second renamed-source proposal reaches the
unchanged backend conflict gate and cannot create a second event.

## Discord discovery availability

`discord-discovery-availability.test.mjs` runs the full001–035migration chain in PGlite and actual discovery/store/chat/live-read adapters. It reproduces the previous eBoard outage and checks same-policy refresh continuity, immediate observed revocations, descendants, withheld new sources, stable identities/manual disables, initial and legacy incomplete upgrades, malformed proof, policy changes, CAS and completion cursors, service-only ACLs and no stored message bodies. Historical017/020fixtures remain unchanged. Local tests do not establish hosted migration or real Discord delivery.

## Map current/upcoming read verification

`tests/map-presence.test.mjs` now has 17 checks, including minimal service-only building/people reads, current versus future-planned separation, identical source allowlist/current-policy checks for future plans, invalid-time/status exclusion, no provenance/private identity disclosure unchanged route authentication, exact local-owner-plan boundaries and clock advancement proving future-day plans do not populate the current map. The old roof-fan/hover browser layout fixture remains superseded; current visual review is user-led.

## Map roster/schema verification

`npm run test:map-roster` includes map-schema.test.mjs and map-roster.test.mjs. The26checks run actual001–021SQL with populated preservation fixtures, strict JSON references/expiry/moves, RLS/grants and deterministic9location/26avatar seeds, plus synthetic name ambiguity, short-surname prefixes, bots, incomplete searches, rate limits, precise string IDs, explicit apply and conditional identity-write behavior. Existing Discord client5/5 and API build also pass. PGlite does not establish independent concurrent-session timing; hosted counts/grants/receipt and live identity-import outcomes have separate evidence.

## Branded startup verification

`map-startup.mjs` keeps nine readiness/error tests and verifies input remains inert
through the ordered 1100ms logo exit and 1000ms backdrop exit. `startup-visual.mjs`
adds twelve focused cancellation/revocation/timer/reduced-motion/mask-decode tests.
`startup-reveal-browser.mjs` records real compositor frames, phase mutations,
transforms and long tasks on an unheld real map load or held-resource fixture.

Runtime colors now use two static SVG masks and CSS conic-disc transforms;
video and animated SVG exports are authoring/shareable artifacts. Browser pixel
normalization and the deliberate 650ms main-thread block prove actual color
movement independently of JS callbacks. The native SVG case in
`brand-loader-browser.mjs` remains an asset-authoring check; its runtime fallback
cases cover production failures and reduced-motion preferences.

Use fresh `MAP_EVIDENCE` for every run and `MAP_URL` for the current server.
`MAP_HOLD`, `MAP_BLOCK`, `MAP_MOBILE`, `MAP_DPR2` and optional `MAP_PROFILE`
select bounded diagnostic variants. Phase durations use MutationObserver times,
since an rAF sample may first observe a transition after it has already begun.
All browser API routes are intercepted. No actual hardware/GPU FPS is claimed.
Fresh M43 evidence is under `evidence/m43-smooth-reveal/`; earlier passes remain
preserved. `map-input-browser.mjs` and `building-view-browser.mjs` wait for final
entered state, beyond map readiness, before interacting with the scene.

## Simplified update agent verification

`update-agent-simplified.test.mjs` runs the production adapter and Calendar client
against synthetic HTTP/OAuth for exact queued Gmail create/update/cancel grants,
fresh body/sender/subject/date checks, metadata/snippet denial, duplicate and target-date
coverage protection, natural announcements and explicit cancellation. `update-agent-mcp`
and `update-agent-miro-outage` verify worker construction/preparation never touch Miro,
register board grants or block unrelated work on missing configuration or outages.
Shared Miro/chat checks remain separate.

`update-agent-calendar` retains handler preparation/idle/queue/fragment and current
source authorization tests. `update-agent-map` and `update-agent-sync-policy` retain
exact source, original speaker, successful identity receipts, independent participant,
optimistic revision and Calendar-owned field controls. `staged-runtime-integration`
exercises actual handler/Calendar APIs/map projection/cache integration, including
signed Gmail Member Plans, existing occurrence RSVP updates, one-model-turn irrelevant
input completion, mechanical failure without model pagination, exact retained task
versions and lease fencing. All transports and model responses are synthetic; no
live accounts, business records, source reads or model calls are exercised here.

## Update agent cadence verification

`agent-automation.test.mjs` checks the 30-input/1800-second defaults and RPC parameters. `agent-automation-sql.test.mjs` uses real migrated SQL through the production config/store to verify mixed Discord/Gmail counting, duplicate suppression, oldest-input age, the 60-second cooldown and preserved 20-input claim limit. Thirty minutes is measured from the oldest eligible queued input, not fixed clock times or the prior run. Independent local suite: 79/79 with API build; no hosted activation or model calls.

M39 publication verification: fresh14 keyboard,21 camera,16 interaction and13 offline Chrome assistant checks pass. The old interaction count now explicitly excludes Lipton; Spotlight uses the current live-tool context and an injected source fixture instead of the retired knowledge-search RPC. Actual Hono auth/tool validation, Vite proxy, provider streaming and UI are exercised without live source/model calls. Prior M38 full581/581 and both builds cover unchanged product source. Fresh evidence: evidence/m39-working-tree-publication/.

# Current backend and collector verification

Map asset checks resolve retained exports and derived data beneath root `assets/`.
Older evidence and original request documents retain their historical paths;
reruns must write fresh evidence rather than replace those records.

Run `node --test --test-concurrency=2 tests/*.test.mjs` for the current unit/API/SQL regression suite. The bounded concurrency prevents overlapping PGlite instances from exhausting memory. M38 final full suite passed581/581 after Gmail switch separation and wrapper removal (focused55/55), with API and frontend builds; see evidence/m37-tool-organization. M36 independent final integration passed578/578 before final Gateway regressions, and final focused rollout review passed58/58; see evidence/m36-collector-cleanup.

`discord-events.test.mjs` covers original create/edit/delete payloads, replay deduplication, blacklist/category/thread ancestry, metadata races, permanent versus transient access loss, committed Gateway checkpoints, bounded buffering, shutdown and service-only session RPCs. `discord-manual-disable-sql.test.mjs` executes actual001–020 SQL and current discovery/store adapters. `collector-deploy.test.mjs` checks exact separate runtime closures, pinned dependencies, secret/symlink/path rejection and service configuration.

Historical SQL suites retain small fixtures under fixtures/. They verify immutable migration behavior and preservation; they do not represent active archive jobs. Existing browser/map scripts below are historical or purpose-specific; use a new evidence directory for current runs, never overwrite preserved acceptance evidence.

Publication fixture correction: historical archive-scale tests apply the final
name schema before seeding authoritative channel names, without relying on the
machine's current-week migration-upgrade clock. Scale plans/slices/explain and
execution-budget catalogues write only to unique OS temporary directories;
reruns preserve historical repository evidence. All original assertions remain.

Bounded token-truncation recovery passed80 provider/11 pure cache checks, API build and independent review. It reserves and charges one6400→12800 retry only for an explicit eligible token-limit response, within the existing3-attempt and spending caps. Full historical bootstrap remains incomplete; live deployment is root-owned.

M20 new010scope/deadlines locallyaccepted4new/13existing/API/reviewPASS. RoottwolegacydeadlinefixturesPASS. No role/globalsettings/body/ACL/cache/financialchanges; hostedapply/concurrentRESTgatepending.

M20 current6400token ceiling locally accepted57provider/11purecache/API/evaluatorPASS. Allresponseusage reserved/accounted; original$1/$5caps and byte/cache/source/SQLboundaries unchanged. Fullbootstrap incomplete.

Current M20: phase-aware final structured response parsing accepted; commentary excluded while full-response usage is charged.57provider/12cache and independent review PASS. Full historical/bootstrap and Railway summary rollout remain pending.

Citation decoder acceptance:63focused/243integrated, shared allowed-ID enum and genuine780-original/37-stage cached publication. Provider/runner only changed; applied SQL001–009 remain immutable. Actual API/history/deployment acceptance remains root-owned.

009final independent local acceptance:233/233 integrated plus latest unchanged695-slice/104MB scale,14genuineSQL/75parity states, APIbuild/diff/hash. Semantic/cache/charged recovery findings closed with original caps/receipts. Final evaluator and actual hosted planning/model/deployment remain pending.

# Current map acceptance checks

`map-asset-integrity.test.mjs` uses the actual committed GLBs to check source
mesh/material/color preservation, Leslie and Coles replacement ownership,
unchanged neighboring geometry, coordinate alignment and fountain clearance.
It replaces the useful asset checks from retired milestone scripts.

`map-focus-framing-browser.mjs` starts an isolated Vite fixture and uses installed
Chrome with synthetic API responses. It checks actual landmark placement,
responsive framing, real pointer selection and camera gestures through current
map behavior. It blocks nonlocal requests and does not need a separate API server,
website credentials or live club sources. `CHROME_PATH` can select Chrome and
`MAP_EVIDENCE` redirects its output.

```sh
node --test tests/map-asset-integrity.test.mjs
node tests/map-focus-framing-browser.mjs
```

The old milestone browser scripts and one-off captures were removed after their
meaningful checks were consolidated. Historical evidence and journal entries
remain records of their original runs; their commands are not current run guides.
`map-failures.mjs` remains a separate unavailable-asset/WebGL fixture.

M8: global-center-geometry.mjs verifies exact replacement ownership and source preservation offline (11 checks).

M9: map-presentation.mjs checks camera samples/actual OrbitControls, effects lifecycle, atmosphere shader hooks and actual projection math without a browser.

M9: camera-focus.mjs verifies spring motion, front framing, focused-only tilt and equal-time30/60/144Hz behavior; map-interactions.mjs tests wheel/click/drag and listener cleanup. M10: park-vegetation.mjs independently checks placement/exclusions, source hashes and baked geometry. These tests do not launch a browser.

M11 updates camera-focus/map-interactions/map-presentation for reverse overview, wheel traces, analytic fog/sky and screenshot default. union-square-context.mjs audits the two omitted baked models and preserves adjacent city geometry.

M12: map-memory.mjs verifies exact context attributes, safe ownership and hover transform propagation.

M21 map-startup.mjs replaces the retired loading-screen.mjs with8pure/DOM behavior checks for truthful automatic readiness and retry.

- M15 assistant/provider/knowledge fixture suites last reported 32 passed and 1 Hono dependency skip; real API/SQL/browser acceptance is pending.

M16 local acceptance uses `node --test tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs tests/discord*.test.mjs`.
The Discord client, store, worker, API and provider suites use deterministic fixtures
and make no live service calls. `discord-sql.test.mjs` executes both local migrations
in an in-memory PGlite PostgreSQL instance with pgvector, exercising service-role
ACL checks, transaction rollback, original revisions, checkpoint concurrency,
source disabling and embedding provenance. It does not verify a cloud deployment.

`node tests/discord-admin-browser.mjs` starts its own ephemeral local Vite server
and installed Chrome, intercepts admin API requests with explicit fixtures, checks
denied/unavailable states, safe channel titles, add/disable mutations, New York date
conversion and mobile layout. Set `CHROME_PATH` when Chrome is installed elsewhere.
Current M16 output and screenshots are under `evidence/m16-discord-archive/`.

M17 `discord-launch.test.mjs` independently checks bot/application preflight,
explicit admin registration from the Discord epoch, old originals, bounded
checkpoint resume and catch-up, scope and permission failures, sanitized results,
strict worker exits and actual SIGTERM handling. It also checks the isolated
deployment allowlist and symlink rejection. All network behavior is injected;
`evidence/m17-discord-launch/signal-preload.mjs` prevents the subprocess signal
test from making a real request. Run `node --test tests/discord-launch.test.mjs`;
the combined assistant/Discord command above includes this suite. Local evidence
does not establish a hosted Discord run or Railway schedule.

M18 discovery/memory/management coverage independently exercises archivedthread cursors, inherited exclusion/permission/revision/reset guards, SQL scoped preservation, NY168hour/day/week/month/DST semantics, source-granted group pagination, staleembedding flags and recursive image stripping. Live cloud completeness is separate evidence.

M19 `node tests/building-view-browser.mjs` uses installed Mac Chrome and a local
Vite server at http://127.0.0.1:5173. Set `CHROME_PATH`, `MAP_URL` or
`MAP_EVIDENCE` to override. It captures eight screenshot-derived building views
in landscape and portrait, checks camera directions/height reduction and projected
bounds, exercises actual canvas hover/click with merged-detail lift, and verifies
saved-overview return using actual wheel input over the canvas, assistant launcher
and assistant panel. Document wheel and momentum tails use synthetic DOM events.
Assistant status is intercepted locally; no live model call is made. Current
captures and results live in `evidence/m19-building-views/`; exact screenshot pixel
reconstruction and touch hardware remain outside this suite. `map-interactions.mjs`
also checks screen-capture routing, loading gates, native inactive/inward scroll,
one canvas delivery, return tails and disposal without launching a browser.
The eighth view is Silver Center from the latest image that was labeled Stern;
the orchestrator records that interpretation separately from the seven explicitly
identified building views.

M21: node tests/keyboard-pan.mjs checks5camera-relative movement, diagonal/time/bounds and typing/blur guards; camera-focus.mjs now has21checks, including Bobst/Silver1.2×noncompounding fit. map-interactions.mjs checks16event-routing cases for10selectable roots. map-input-browser.mjs uses installed Chrome and MAP_URL (default4179) with MAP_EVIDENCE output override; it holds/fails real assets and checks auto-entry, WASD, assistant typing, blur, exact original part bounds and Stern/plaza hover/click. building-view-browser.mjs is updated for automatic startup and distance multipliers. API status is locally mocked, with no backend/model calls. Direct tests per user request, not independently delegated.

M23: `node tests/keyboard-pan.mjs` independently exercises observable smooth
acceleration, reversal, braking and250ms settlement at30/60/144Hz;60percent
faster close/mid/far cruise; normalized diagonals; capped travel; blocked-axis
momentum removal; and immediate keyboard/pointer/wheel/focus/scripted handoffs.
It writes new evidence under `evidence/m23-smooth-wasd/` (override `MAP_EVIDENCE`).
The previous M21 evidence remains unchanged.

`node tests/keyboard-pan-browser.mjs` runs against a fresh production preview,
default http://127.0.0.1:4183. It captures actual camera snapshots on rAF with
both callback and observed clocks, checks acceleration and80ms braking windows,
settlement, a400ms blocked-frame release, real WASD/assistant/blur/reset/restore
handoffs, actual Gould hover/click and merged Stern/plaza alignment, and outward
wheel takeover over the assistant. `MAP_URL`, `CHROME_PATH`, `MAP_EVIDENCE` are
supported. Default graphics backend is intentional: forced software rendering
was too slow to assess acceleration at1440×1000. API status is mocked locally;
map geometry and input are real. Physical keyboard feel is outside automation.
The retained map-input-browser regression now waits300ms after key-up to match
the authorized250ms braking tail.

The M21 map-input-browser regression now uses normal Chrome graphics by default;
set MAP_SOFTWARE_WEBGL=true to request SwiftShader explicitly. Its key-up settling
wait is300ms to cover the accepted250ms M23 braking tail; assertions are unchanged.
Forced software rendering can be too slow for short held-key motion probes.

## M24 floating assistant and local startup

`npm run test:assistant` covers client/provider/knowledge contracts and native-dialog fake DOM behavior (34 passing in M24). `node --test tests/dev-runtime.test.mjs` starts isolated real local API/Vite processes to check custom-port proxying, SIGTERM cleanup, occupied API preservation and frontend-failure cleanup (3 passing).

`node tests/spotlight-browser.mjs` launches installed Chrome and its own loopback provider/repository plus paired local runtime. It exercises actual map loading and proxy-to-Hono-to-provider streaming, draft/history/stop/error/source safety, native modal shortcuts/focus/backdrop, selected-building context, map isolation/recovery, 390px mobile layouts and independently scrollable long replies (13 passing). `CHROME_PATH` overrides the installed browser path; `SPOTLIGHT_EVIDENCE` overrides evidence/m24-spotlight-assistant. These fixtures never read .env or call a real model/cloud service. The primary agent's separate one-request real-provider smoke is recorded under evidence/m24-spotlight-live.

M24 changes keyboard-pan-browser.mjs and building-view-browser.mjs expectations only where the new native modal must block map scrolling. Outward focus return remains available once the modal closes; existing M23 motion/geometry assertions remain. Current final run evidence is under the M24 evidence folder.

M25/M26 final independent12-suite connector command in evidence/m25-connectors/independent-report.md passes132/132; fresh-parent denial covers14 malformed cases. Summary/SQL/default-worker launch root check73/73 passes. These fixture results do not establish hosted execution or semantic model quality.

M27 tests miro-{client,deploy,snapshot,sql,tools}.test.mjs independently exercise pagination/typed originals/group context, errors and limits, real001+012 PGlite leases/ACL/atomics, isolated upload inputs and actual HTTP fake-provider model context. No live model or Miro calls.

provider-tool-compatibility.test.mjs adds6officialLuna/Sol tool-planning payload regressions;95targetedchecks pass. FinalfullDiscord350/350 log is evidence/m25-summary-only/final-discord-tests.log. Hosted realreadback is distinct in evidence/m25-cloud/final-report.md (726/726currentvectors, raw0, pending434).

M28: schema-cleanup-sql.test.mjs executes actual001–014 with populated summary,
receipt, vector, source and Miro fixtures. schema-cleanup-runtime.test.mjs proves
retired interfaces make noHTTPcalls and active status remains available. Historical
SQL tests use tests/fixtures/legacy-summary-store.mjs and explicitly bounded
migrations; the fixture is excluded from production deployment contexts.

Current final schema acceptance: schema-cleanup-shared-access.test.mjs applies
001–016 and proves19tables, no per-person membership dependency and preserved
source/admin boundaries. The policy-rename suite independently verifies001–015.

M29 current acceptance: discord-catalogue-*.test.mjs executes001–017 with populated
retired tables and checks the3-table schema, metadata preservation, discoveryCAS,
live source/admin boundaries and network-free retirement. Historical live-summary
fixtures test immutable001–016; actual current RAM summarization helpers remain
covered separately. Live tests also cover same-revision catalogue withdrawal.

M30 discord-search-threads.test.mjs preserves13independent regression cases for
parent-filtered thread hits, scope/permission/race denial and bounded expansion.
M31 lipton-selection-browser.mjs checks real loaded Lipton geometry with actual
ray-hit mouse clicks and verifies Stern/Bobst interactions remain functional.

M32 user-time-zone tests exercise strict IANA validation, local-date rollover,
DST and fractional offsets, identical generic/RAM tool windows, exact bot paging
boundaries and API clock propagation. user-time-zone-browser.mjs uses installed
Chrome with timezone emulation and intercepted API responses to verify the actual
frontend request, per-send timezone changes, UTC fallback and request byte limits.
No live model calls are used.

M33 agent-input-cache-sql.test.mjs independently executes actual001–018 SQL in
PGlite. It verifies the exact two-column generic JSON cache, UUID/null constraints,
service-only CRUD grants, default-grant revocation and forced RLS. Browser/public
roles are checked both without grants and with artificial CRUD grants to prove
RLS itself denies access. Populated source/policy/Miro baseline tables, ACLs and
functions are preserved; exact processed-UUID deletion leaves a later arrival.
Run `node --test tests/agent-input-cache-sql.test.mjs`; evidence is in
`evidence/m33-agent-input-cache/`. No hosted database or runtime ingestion is tested.

M34 agent-automation.test.mjs exercises event identity/scope, hybrid worker gating,
explicit completion, bounded tool rounds, native provider call/result IDs and
recovery-safe action receipts with synthetic adapters. Read-only tools are checked
for fresh reads on retries. agent-automation-sql.test.mjs executes001–019 and
checks actual service-only RPCs, durable queue/cooldown/leases, stale-token fences,
exact hash-checked cleanup, retained bodies on failure and subscription cursor CAS.
Run both with Node's test runner; evidence is in evidence/m34-agent-automation/.

M35 gmail-subscription.test.mjs covers authenticated Pub/Sub push, account/source
scope, lossless Gmail history IDs, watch/renewal, CAS leases, page-budget recovery,
partial enqueue retry and explicit404 resync. Oversized MIME fallback is checked
through the actual runtime source authorizer/shared updater as well as isolated
subscription fixtures; failed fallback/queue writes preserve cursor and prior
cache rows. A101-addition single history record must drain across recreated
subscription instances; sorted page fingerprints/offsets resume failures, reset
safely on changed pages and avoid replay after ordering-only changes. All OAuth,
verifier, Gmail and Supabase responses are synthetic.
Evidence and command results are in evidence/m35-gmail-subscription/.

miro-unsupported-items.test.mjs verifies mixed-page original metadata/order, safe unknown type handling, cursor/index disclosure, context bounds and whole-page discard after supported detail denial.

miro-group-pages.test.mjs covers exact 64-bit numeric identity, group membership-slice merging/raw envelope retention, malformed/conflicting groups, pagination/bounds, structural-first capture and fresh consistency retries.

map-presence.test.mjs verifies authenticated safe map reads, debug restrictions, source policy, expiry and bounded failure. map-presence-browser.mjs exercises live and synthetic avatar markers through the paired local runtime; see its environment settings and evidence/map-presence-ui/.

map-building-write-scope.test.mjs executes actual001–022 in PGlite to verify people_here-only runtime updates, catalogue/insert/delete/upsert denial, unchanged data/other grants, validation, internal timestamps and invoker atomic moves. Included in test:map-roster; historical021 checks remain unchanged.

map-presence-labels-sql.test.mjs executes001–023 for required JSON label validation, ordered legacy backfill, Unicode bounds, unchanged fixed-catalogue grants and RPC compatibility. Current presence API/browser tests verify verbatim table labels, no isDebug/display inference, blank labels, safe text and long-caption bounds. Historical021/022 fixtures remain unchanged.

map-events-sql.test.mjs executes001–024 in PGlite and checks flat-event validation,
nine empty defaults, exact old-row/function/ACL preservation and runtime access
boundaries. map-presence.test.mjs additionally checks event source-policy denial,
cancellation/expiry, ordering, deduplication, safe links and presentation-only
responses. map-building-activity-browser.mjs exercises the real map with synthetic
people/events in an isolated preview; evidence is in evidence/map-building-activity.
Checks are direct in this side conversation, without independent subagents.

map-presence.test.mjs additionally verifies the exact Bobst event-fixture provenance/ID/title boundary, denial to production/members/other buildings, and independent ordinary-event authorization.

map-contracts.test.mjs verifies shared schema/example parity against actual001–024 SQL and existing privileges. update-agent-prompt.test.mjs captures actual handler-to-provider system instructions and tests policies, scoped completion and unavailable actions using synthetic providers. Both run under test:update-agent-prompt and test:agent-automation; no live model calls or behavioral-compliance claims.

025 SQL/API checks cover optional/legacy attendees, UUID type/duplicate/unknown/bounds rejection, profile trackability, source authorization and no derived current presence.

Assistant UI cleanup updates existing fake-DOM and spotlight assertions to expect
no context/footer badge; selected-building forwarding remains tested. Direct
isolated Chrome checks verify composer colors, repeated opening pop-in, reduced
motion and offline retry; full spotlight rerun is not claimed by this pass.

`map-source-access.test.mjs` independently checks the map authorizer's exact Discord/Miro/Gmail references, current source service checks, account/source denial, malformed URLs, withdrawal and cancellation. Event migration/projection/tool checks are collected by npm run test:map-events; historical021–025 SQL fixtures remain unchanged.

`node tests/rapid-ui-browser.mjs` (running Vite at MAP_URL, default5173) verifies
actual assistant controls with synthetic fetches and presence with a synthetic
box/long label: desktop/mobile ivory/pastel states, visible hover color spin,
reduced motion, square-stop cancellation without resubmit, preserved draft,
Flock header/no Clear, and stable note dimensions across90first-focus frames.
Assistant fake-DOM regressions also cover integrated stop/default prevention.

`node tests/assistant-dismiss-browser.mjs` uses the running Vite server (MAP_URL,
default5173) to test actual desktop/mobile dismissal, draft/focus retention,
interrupted exit/reduced motion, white enabled send icon, streamed height growth
with a fixed top, and clean event typography/spacing. Source data/models are
synthetic and no live model calls are made.

Map presence overlap-caption regression tests cover blank newer attendance masking stated activity, independent participant report chronology, stable ties, denied/expired/future exclusions, verbatim text and private ranking metadata.

Live tool/Markdown coverage: `chat-tool-stream.test.mjs` verifies real early NDJSON
start records before a deferred tool resolves, exact safe event projections,
status/transition validation and interrupted streams. `assistant-markdown.test.mjs`
checks formatting, source links, raw HTML/image handling and incomplete prefixes.
`node tests/chat-tool-browser.mjs` uses real local Hono HTTP streaming with synthetic
adapters and Vite UI (MAP_URL, default5173); it verifies desktop/mobile tool blocks,
start/result/partial/failure/cancel, message bubbles, fixed send top, visible
Thinking/status shimmer, static Done/Partial result, reduced motion and Markdown.
No actual model/source calls are required.

`chat-calendar.test.mjs` verifies chat-only Calendar reads, trusted Google access, fixed target, write rejection, pagination/full event context through planning and answers, error/empty coverage, and protected HTTP inventory/dispatch.

Event-type SQL tests apply immutable028 after026/027 and verify fixed categories, default/preserved classifications, invalid-type atomic rejection and restricted grants. events-browser.mjs applies001–028 through the actual service and checks all activity kinds, dates/rooms/portraits, no category icons or category asset requests, and mobile last-portrait reachability above the assistant launcher. Synthetic evidence stays in evidence/events-relationships/.

`bug-reports.test.mjs` covers real migration029 SQL, minimal schema/RLS/grants, idempotent append/conflict behavior, trusted current-user context, sanitized fixed RPC and actual Hono chat planning/receipt delivery.

`node tests/assistant-scroll-browser.mjs` uses Vite (MAP_URL/default5173) and
synthetic streamed tool/Markdown replies. Four turns at desktop/mobile/short
viewports sample65frames, asserting a visible bottom gap, settled bottom-follow,
long-composer resize retention and idle manual scrolling. No live model calls.

Miro MCP tests cover official read schemas, OAuth/refresh/limits, inert calendar SVG, stable row provenance, both-agent scope rechecks and030live-only SQL. Historical SQL assertions use frozen retired-miro-rest test fixtures; no application path imports them.

`memory.test.mjs` verifies real031SQL singleton/RLS/grants, stale update conflicts/no-ops/clearing, trusted chat context, automatic-use prompt policy, actual SQL→tool→Hono persistence/injection across chats, unavailable-memory behavior and bounded RPC output.

`node --test tests/map-presence-drag.test.mjs` verifies complete portrait/note drop
bounds, unchanged valid drops, blank labels and narrow/zero frames.
`node tests/map-avatar-drag-browser.mjs` (MAP_URL/default5173) exercises actual
mouse/touch capture, snap-back, selected-person Schedule, polling/cancel/overview
and reduced motion at desktop/mobile sizes, then checks unchanged camera on the
real campus. Synthetic people/data only; no database writes or live model calls.

miro-empty-search.test.mjs and MCP regressions cover real omitted-results zero-match shape, malformed/continuation denial, no write authority, preserved date context and bounded follow-through to actual calendar content.

miro-navigation.test.mjs checks shared guide delivery and scripted section/date/subject navigation, duplicate month/year ambiguity and explicit Miro versus Calendar fallback. Scripted planning is not real-model compliance evidence.

Agent prompting acceptance includes chat-agent-policy, discord-agent-policy, calendar-map-provenance, update-agent-sync-policy and google-mailbox checks. These exercise actual Hono/service/adapters with inert source/model boundaries, explicit team/leadership access, request-local original evidence, exact Calendar occurrence identity and source-bound participant receipts. Connector/date stream tests select metadata records by type because tool progress precedes metadata. Historical shared-access SQL tests use frozen retired Miro adapters, never current runtime fallback. Configured-model behavior is separately measured by scripts/verify-agent-prompts.mjs, with synthetic sources/inert write stores and explicit --live-model opt-in.

chat-calendar-write.test.mjs exercises real Calendar client/HTTP orchestration with synthetic Google responses, intent isolation, revision conflicts, conditional patches, retries and truthful receipts. chat-drive.test.mjs covers authorized Drive search/read, original links and partial/error boundaries without Calendar writes.

`discord-calendar-sync.test.mjs` checks clear club-event create/edit/cancel, stable source identity, negative RSVP/personal/negation cases, stale or truncated live messages, all-day windows and safe cross-source deferral. The actual handler projection test verifies canonical applied arguments are hashed for receipts.

assistant-scroll-browser.mjs also checks a fixed18px lower panel gutter at top/intermediate/bottom scroll positions on desktop, mobile and short screens. Cutoff screenshots show the non-scrolling ivory strip above the inset.

`discord-rate-pacing.test.mjs` uses fake clocks/transports to verify shared serialization, cancellation ordering,429/header/JSONcooldowns includinglongwaits, retry/deadlinebounds and sequential truthful aggregate coverage without live Discord calls.

Bundled-handler protocol checks reject invented Calendar pagination and preserve exact applied projection receipts. Irrelevant inputs can finish without mandatory model projection; foreign/unknown/mixed calls still fail closed. The model harness enforces exact fake Miro/Discord selectors and Calendar windows/tokens; previous permissive diagnostic passes are distinguished from strict-fixture reruns.

Optimization checks include fresh batch authorization cost, exact answer-context compaction, bounded Miro queue/token owner, web volume bootstrap, production site sessions/static isolation and sanitized runtime deployment. Independent browser evidence lives in evidence/optimization.

scoped-agent-claim.test.mjs runs realSQL mixed-scope trigger/lease/ACL/finish cases and productionstore/handler wiring, preserving historical019fixtures.

The retired planner workload model wrapper duplicated shared scenarios and tested the former worker Miro path. It was removed during test cleanup; its ignored evidence remains historical. Current staged runtime and live Miro chat tests cover their respective behavior.

site-auth.test.mjs covers explicit custom-domain login aliases and authenticated
writes, malformed/insecure alias rejection, foreign/cross-site denial and stable
canonical provenance. It also includes login-favicon boundary checks: exact anonymous
GET/HEAD routes serve correctly typed icons, while writes, aliases, other assets,
APIs and symlinked files retain their original denial behavior.

password-page.test.mjs executes the actual inline login script with synthetic DOM
objects to check length-only masks for typing/paste/clear/restored values, live
clock formatting, one native requestSubmit on Enter and no submission for IME
composition/ordinary keys. Actual Chrome native form flow is separately checked
with an isolated synthetic session, never real credentials.

Historical recovery evidence includes Discord metadata continuation lifecycle/real deadline shapes and the former worker Miro navigation path. Current workers expose no Miro tools or Miro completion dependency; shared Miro parser/auth tests remain. The retired recovery wrapper was removed during test cleanup because its unique checks required the removed worker Miro dependency. Historical evidence remains separate from current staged-worker behavior checks.

The assistant fake-DOM regression verifies close/cancel preserve active request,
hidden completion enters history and explicit Stop still aborts. The rapid UI
browser check now expects hover glow without spin and nonhover streaming spin.
Actual Chrome synthetic fixtures additionally cover X/Escape/backdrop/CmdK,
hidden tool progress/completion, latest-scroll and retained followup history.

Miro quota tests cover metadata-only shared UTC counters, background cadence, protected chat capacity and source authorization. Independent acceptance adds concurrent/restarted governors, cancellation, fragment refetches and broker/native OAuth retry accounting. Provider calls are synthetic; hosted receipts are separate.

The rapid UI browser check waits for the hover glow transition to settle before
reading its shadow; streaming animation is checked without hovering the button.

Chat production coverage includes once-only varied bug-report attempts and normal map attendance updates through actual Hono, service and RPC adapters. `chat-attendance-orchestration.test.mjs` uses scripted choices to verify existing-event preservation, verified speaker/name lookup, clarification history, failed receipts, conflicting human edits and refreshed event participation. `chat-attachments.test.mjs` covers bounded file validation/API/provider/history. Historical attendance-link visibility checks live in `map-source-access.test.mjs`; the retired attendance parser/service tests are removed.

`chat-attendance-model.mjs --live-model` separately evaluates the configured model on the exact first-person GoGreek request, an unlinked speaker followed by a name-only answer, ambiguous same-day events, conflicting writes and quoted declarations. Its actual chat runner, prompts and ordinary map tools use simulated storage. Only the configured inference endpoint can use the network; model audits stay in memory, request count/time are bounded and results are written to a private temporary JSON file. It makes no calls without the explicit flag. This evaluates model choices and simulated saved outcomes, without claiming live Discord, Calendar or hosted map writes.

Use repeated `--case=` name prefixes to rerun only affected scenarios and `--max-requests=` to lower the total inference budget. A budget stop is an incomplete evaluation; inspect already executed writes before attributing it solely to the limit.

Map presence/source-access regressions cover projection-local provider reuse, exact attendance marker bindings, fresh request revocation, unchanged general-write authorization, bounded concurrency and cancellation under the total read deadline.

map-refresh-browser.mjs runs an isolated actual-campus Chrome regression with synthetic native HTTP tool streams and map responses. It verifies avatars before reply completion, minimized attendance, stale-read coalescing, transient retries, access denial, foreground/disposal cleanup and unchanged camera/model geometry. Evidence uses synthetic people only.

model-audit-store/sql/provider/integration tests exercise private audit ACL/TTL/idempotence, recursive credential redaction, every provider dispatch/stream failure mode, usage/pricing and real chat/worker runtime correlation through inert service-role PGlite RPCs. No live models or private source payloads.

feedback-discord.test.mjs exercises affirmative named-team meeting questions and exact-channel summaries with the real policy/retrieval path and inert providers: timing, budget, cancellation, source access, leadership exclusions and failure versus absence.

assistant-presentation.test.mjs verifies readable citation labels and safe platform detection. feedback-browser.mjs uses only synthetic responses on an isolated local Vite server to check footer geometry, streaming/history, source safety, uploads/errors, shortcuts, viewport shrink and retained animated Stop. Evidence lives in evidence/site-feedback; no private reference screenshots are retained.

model-audit-cache-cost.test.mjs applies034incrementally after033 and tests existing-row/ACL preservation, actual-shaped cache writes, impossible counts and unknown/long-context pricing.

Discord interaction tests cover shared runner/trusted context, adapter/client/delivery/config, independent access/bridge and Gateway failure paths using synthetic clients. They distinguish process-local replay prevention from durable delivery, and verify that channel replies cannot load website memory/private tools.

Automatic context tests exercise live-service pagination with synthetic originals, the exact one-hour boundary, full-text/partial coverage and two-column identity-directory selection; no live messages or credentials appear in evidence.

`discord-reply-context.test.mjs` reproduces the missing old announcement through
the production live Discord HTTP client, policy service, context loader, private
bridge and shared runner. It checks exact trigger/approved-author binding, one
same-destination direct reference, whole 10,000-character text and tail facts in
both model phases, independent hour coverage, edited/empty/non-text records,
explicit unavailable/oversize coverage, source/audience/policy withdrawal and
final publication revocation. Strict immutable validation, spoofed browser/bridge
context, cancellation and exclusion of source bodies from audit/output metadata
are covered. A production native-provider serializer test verifies both actual
planning/final HTTP envelopes, including reply evidence when the hour is empty;
repeated requests verify fresh target reads. Source instructions remain data in
the prompts; scripted providers verify transport and policy wording, not
arbitrary model semantic decisions.
Every HTTP response is synthetic; no live Discord read, post or model call occurs.

Drive skill acceptance covers selective pre-execution activation in both chat and the autonomous planner, request/batch isolation, live directory pagination, access denial and exact deployment asset inclusion. Connector fixtures retain bounded exports and prevent Drive reads from granting Calendar/map write provenance.

`discord-chat-team.test.mjs` exercises team text/thread bare-ping chains, exact invoking-channel capabilities, preceding-hour context, member/source blacklists, website intent isolation and final publication revocation.

`discord-chat-tool-parity.test.mjs` compares real website/Discord planning catalogues and exercises shared adapters, Google grants, Drive skill activation, memory concurrency, bug receipts and map/Calendar action guards. Access tests separately verify the required nested Discord audience subset.

source-timeouts.test.mjs uses virtual timers and synthetic source clients to verify sixty-second deadlines across composed map/source operations, real expiry, parent cancellation, explicit shorter overrides and unchanged authorization. It reproduces former shorter-cutoff failures without minute-long sleeps.

Discord collector diagnostics tests exercise safe stage/code attribution, nested transport causes, hostile error values, logger failure containment, graceful cancellation and durable checkpoint ordering, CLI setup/teardown, monitor-only nonzero fatal exit and sanitized deployment closure. All fixtures are synthetic; no live Discord messages are sent. Native Node fatal stderr remains outside structured-log sanitization.

Discord total-request deadlines: `discord-chat-config.test.mjs` checks the twenty-minute
default and upper bound, shorter explicit overrides, clamping and malformed values.
`discord-chat-tool-parity.test.mjs` observes actual runtime timers: Discord gets its
own deadline while website chat retains its independent configured deadline
(five minutes in that fixture; the runtime default is now seven), with separate body-read limits. Remote delivery has a thirty-second allowance beyond the bridge's default.
These checks inspect scheduled deadlines without waiting twenty minutes.

`discord-chat-bridge.test.mjs` exercises the private Railway native HTTP branch
against ephemeral loopback HTTP servers via the injected request resolver. It
checks strict private origins, actual bearer/POST/bridge behavior, redirects and
non-success statuses, complete/truncated and 250KB response boundaries, and
cancellation/deadlines both before headers and during response bodies. Private
requests must bypass fetch. Railway DNS, IPv6 routing and deployed reachability
need separate live verification.

Harness reliability tests: provider-retries.test.mjs verifies transient HTTP/transport classification, bounded attempt/deadline/Retry-After behavior, per-attempt audit and no successful-body/stream replay. automation-reliability.test.mjs covers settlement wiring/cancellation and real Calendar identity across changed batch keys. automation-reliability-sql.test.mjs executes migrations001–036 in PGlite for fair singleton retries, lease/snapshot/source fences, quarantine retention and service-only recovery. Historical migration fixtures remain unchanged.

`personal-location-behavior.test.mjs` exercises synthetic original personal-location activity through actual map service/chat adapters and SQL001–036, including stable-source retry/correction, active/future/expiry projection and identity/action denials. Its explicit `--live-model` mode adapts the existing inert synthetic prompt verifier; it never writes club sources or the hosted database.

`map-avatars.test.mjs` covers private portrait URL/auth/body/checksum/deadline/FIFO bounds and projections. `avatar-storage-migration.test.mjs` covers private uploads, recognized denial envelopes, guarded/idempotent avatar-only CAS writes and concurrent human edits. `map-avatar-storage-browser.mjs` exercises built-map current/attendee images for post-build profiles through real website/API/private-proxy code using synthetic sources; no hosted source or profile writes.

October25 retirement removes the popup-only geometry/browser harnesses and local sample-policy tests. Shared browser harnesses use nine selectable landmarks. `map-event-indicators-browser.mjs` now exercises Silver Center and verifies stale retired-location data cannot create a marker/root/selector entry. `go-greek-removal-sql.test.mjs` checks owner cleanup046, shared-event/people preservation, exact identity conflicts and replay. Historical seed and unrelated synthetic attendance tests remain.

Tool-failure logging tests cover versioned counts, privacy, predispatch versus executed calls, source coverage, sink failure noninterference and provider parser causes. Google and map diagnostic suites distinguish observed upstream HTTP from local validation/deadlines. Calendar location receipt tests exercise actual mocked Hono flows, single/batch and native/planned next-turn/final-answer projections with saved, cleared and unknown locations.

Shared current count scripts and the schema test expect the original nine landmarks after retirement. Original source-tower retention is independently checked in the removal milestone.

`go-greek-building-sql.test.mjs` applies real001–035 plus isolated037 in local PGlite and verifies a single guarded Go Greek catalogue seed, exact preservation/replay/conflicts, unchanged access/metadata, production presence projection and safe future cleanup/FK restriction. Optional036 compatibility is local only; no hosted036 activation is implied.

Active-event indicators retain source-art/controller/resource/window tests in map-event-indicators.test.mjs and desktop/mobile/reduced-motion/failure/selection/retired-location browser evidence in map-event-indicators-browser.mjs. Synthetic API coverage and actual MCP-seeded local preview receipts are distinguished in the journal.

`attio-integration.test.mjs` independently exercises opt-in CRM configuration, source/object/write denials, exact provider requests, bounded content and safe errors, cancellation, request-bound writes and uncertain outcomes, authenticated tool routes, shared native/planned chat receipts and the complete runtime catalogue. All provider fixtures are synthetic; it does not contact Attio or establish live credentials.

`map-focus-framing.test.mjs` checks responsive clear space, smooth capped lens fitting, repeated focus and overview restoration. `map-focus-framing-browser.mjs` verifies all ten real landmark bounds against shared frame and actual card rectangles at desktop/phone sizes; evidence is in ignored evidence/camera-framing.

Discord blacklist coverage includes fresh catalogue resolver/API propagation and independent signed-site/chat/worker/map/Calendar integration. New sources absent environment grants must work, while exclusions, audience permissions and revocations still stop evidence/actions. Empty-scope SQL/runtime tests verify038 retains bounded quarantine cleanup and lease fences without reading pending originals or invoking models.

Discord concurrency checks exercise configured10total/5permember with held overlapping requests, admission before authorization, isolated contexts/reply destinations and slot recovery after success/failure/cancellation. Private bridge checks include ten active calls, HTTP429 above capacity and cancellation recovery.

`discord-draft-tools.test.mjs` independently exercises draft argument/context/destination/permission/blacklist/thread/revocation/cancellation/no-send boundaries with real access fixtures. `discord-draft-integration.test.mjs` checks native and legacy provider propagation, result projection, operational privacy, website absence and unsupported sending.

`calendar-complete-receipts.test.mjs` independently verifies actual saved fields across single/managed/batch writes, clear/missing/sparse/reconciliation outcomes, safe ancillary fields, no private-field leakage, both model paths and realistic/pathological large-batch bounds/reprojection. `calendar-location-receipts.test.mjs` now permits authorized saved descriptions alongside location while still rejecting arbitrary provider fields.

The current scoped-claim runtime test distinguishes malformed/missing scope denial from an explicit empty array: empty scope performs bounded maintenance without originals, source authorization/preparation, tools or model calls. Historical migration032 SQL fixtures keep their original contract;038 coverage tests the current maintenance override.

Staged Calendar acceptance: agent-pending-tasks.test.mjs executes039/store scope/lease/version/TTL/capacity; agent-staged-handler.test.mjs checks same-lease phases/10turn cap; calendar-deterministic-sync and member-plans-calendar test pinned target/metadata/location/relationship behavior; staged-pipeline and staged-runtime-integration exercise actual bundled Calendar-first presence, cached RSVP/task progression, untouched retention, multi-calendar visibility and041 map fencing.

`chat-agent-policy.test.mjs` exercises the corrected existing-tool map workflow: source-free actor/name lookup, no lexical/original/linked-author gate, automatic attribution, applied receipts, authorization/schema/conflicts, map visibility and Discord-to-person context at tool time. Rejected resolver/save/parser/cache tests were removed; historical receipts remain append-only.

Final staged adversarial checks cover all200task UUIDs with bounded manifest text and lossless full reads, cross-cycle original context/history, fragmented secondary-source revocation, protected Calendar notes and Unicode/blank title RSVP matching. Member tool source preparation accepts only exact original/lookup receipts and rechecks authority at execution; missing/mismatched/revoked evidence denies. The live-model smoke uses inert synthetic business adapters; whole-tree concurrent chat failures are separate from accepted frozen release tests.

Manual planner tests exercise API-key-only HTTP authorization, wrong/missing/unconfigured key and cookie/admin fallback denial, unchanged ordinary website protection and bounded stream denial, actual042/043SQL ACL/lease/retry/request boundaries, exact temporary whitelist through real live retrieval/task scope, and API-key HTTP→durable SQL→dispatcher→real staged handler→content-free status. All business/provider responses are synthetic; tests do not fetch live history or write real Calendar/map facts.

Prompt audit behavior tests exercise the actual staged handler/cache and normal chat tools, including bounded conflict recovery and retained tasks after a source failure. prompt-audit-model.mjs exports inert fixtures and runs configured inference only with --live-model; case filtering and hard request caps support focused reruns. Source and business storage remain simulated. See ../docs/prompt-audit.md for dated actual results.

`discord-event-metadata.test.mjs` applies the actual migrations to local PostgreSQL and runs production Discord stores, ingestion and Gateway behavior with bounded synthetic transports. It proves that new-channel messages queue before a held archive request finishes, old scans cannot overwrite the result, replay is safe, and permissions/manual flags/policy races remain enforced. This is local behavior evidence; live Discord/Calendar acceptance is separate.

Staged runtime cancellation cases use the actual worker adapter, Calendar client and task resolver against simulated provider/storage. They verify exact successful cancellation cleanup, authorized absence, failed or mismatched results, untouched tasks and concurrent task versions. An optional CANCELLATION_BASELINE_ADAPTER path permits isolated old-code reproduction without changing shared runtime files.

General-conversation configured-model checks in ignored evidence retain wrong first-write timing and incomplete follow-up; existing78 scoped checks pass but do not establish behavioral acceptance.

`agent-task-duplicates.test.mjs` reproduces omitted-ID follow-up participation duplication against a frozen prior pipeline and checks rejection before persistence, explicit identity recovery and reread, replay, distinct tasks and scope/version denial. The October23 model batch retains its pinned integration source and separately labels a history-assertion compatibility copy.

`automation-six-input-capacity.test.mjs` executes actual isolated queue SQL and Node store transport for six/seventh remainder, Unicode byte packing and retry isolation; real adapter/handler checks cover six channels/thread parents, fresh revocation and lossless fragments. Scripted model replies establish plumbing only.

`agent-task-id-choices.test.mjs` retains a genuine old-handler malformed-ID starvation witness and verifies exact-choice recovery, atomic paired-call rejection, phase/run isolation,20/21/500/empty fallbacks, optional task updates and unchanged read/version/permission/completion requirements. Related call-limit fixtures use actual follow-up task scopes while preserving16/64/128/129assertions.

`agent-native-participation-evidence.test.mjs` retains old-adapter denial for valid native current/prior task originals without separate model source reads, then verifies grouped writes/readback/receipt-backed resolution on the correction. It checks canonical provider times, conflicting revisions, missing identity, current-source failures and unchanged task/CAS/readback guards. Pinned integration source remains immutable; separately labelled compatibility evidence covers the three intentional contract changes.

`agent-short-references.test.mjs` exercises the real staged runner with exact request-advertised queue/task references, corrupted UUID recovery, atomic rejection, canonical receipts and unchanged raw history. It covers all500 task bindings, foreign/duplicate/mutated mappings, field-only expansion, legacy completion and actual source/read/version/proof guards. Scripted turns establish transport and safety behavior; actual-model understanding remains a separately capped gate. Existing task-choice checks now compare advertised reference choices while retaining UUID compatibility and all prior denial/completion assertions.

`agent-finish-recovery.test.mjs` reproduces actual applied-receipt/task retention when resolve and finish are mixed, then verifies atomic rejection, same-version proof reuse and separate successful completion. It checks unchanged fatal/scope/legacy/call limits and real provider native/audit replay with simulated transport. These scripted checks do not establish model understanding.

October23 private chat-preservation coverage uses the real default source authorizer, map service, deterministic Calendar projection and full handler with simulated transports. The true original RED and final GREEN are retained under evidence/gogreek-existing-chat-preservation-20261023; forgery/replay/principal/mode/CAS/protected drift/revocation and incomplete readback deny success. These component checks do not establish model or live queue acceptance.

Staged Member Plans local-clock regression uses actual handler preparation/action hashing/Calendar writes and simulated transports. It retains genuine old raw9PM acceptance, then checks mandatory localclock conversion, exact same-plan raw copies, private double-preparation guards and meaningful DST cases. Independent frozen16includes9existing privateattendance cases; no model understanding is claimed by these component checks.

Task-read/finish checks now cover exactowner/version/fullchain, same-versionactionproof and privatecurrent-taskreview/blocker lifecycle through actualhandler recovery. Originalpremature-finish/privatefixtures are preserved; labelledA-onlycompatibilitycopy isolates privateattendancepreservation, while newtwo-personcase requiresbothcurrentpeoplecomplete. See evidence/gogreek-task-read-finish-regression-20261023.

agent-six-flow-recovery.test.mjs compares real Calendar no-op/source/private-row behavior and staged whole-reply sibling patch recovery against old failures. It also retains a faithful six-input/five-task resource replay; the current provisional runtime fails that capacity check, so its green core checks do not authorize inference/release.

October23 explicit-workflow verification: agent-explicit-workflow.test.mjs checks per-original finish accounting, fresh existing tasks, exact own-source write coverage and nonexecuting incomplete-read recovery with real adapters. The six-flow resource test adds only the question noChangeInputIds wire field; original native/business/read/window/preservation assertions remain. Evidence-only local-clock compatibility copies are separately labelled; original test failures remain recorded.

October23 phase-transcript tests replay the immutable failed seven-request actual model prefix with all five complete native task chains, preserve all task/context/source/proof data and then execute the strict grouped attendance/resolution tail. Boundary tests limit conversation reset to a real successful full initial disposition, leaving partial/capped/hookless/legacy behavior intact. No source evidence or byte limit is reduced.

task-read-disclosure.test.mjs checks that only complete logged delivery of an exact current task can be reused; incomplete, changed, expired, wrong-scope or unlogged reads never gain new proof.

`assistant-queue-browser.mjs` checks actual Spotlight UI/transport with simulated streams: ordered history, captured attachments/building, removal, Stop/failure Resume, background completion, shutdown,10message/20MiBbounds and compact viewports. It requires a local Vite URL and writes temporary screenshots; it makes no business-service requests. `chat-map-time.test.mjs` checks actual chat map adapter clock conversion/preservation/DST/display behavior; `chat-map-time-model.mjs` uses production chat/provider adapters with simulated map storage and an explicit capped inference-only mode. Its default and --self-check make no model calls.

`chat-map-recovery.test.mjs` covers production map validation feedback, equivalent call reuse, both chat protocols, conflicts and unknown-write/hidden-row privacy. `chat-map-recovery-model.mjs` explicitly scripts a known failure prefix, then evaluates actual configured-model recovery with simulated storage and a hard inference cap; initial tool choice is not established by that harness.

Planner follow-up focus uses agent-followup-focus.test.mjs for production-adapter preservation checks and planner-followup-model.mjs with fixtures/planner-followup.mjs for bounded configured-model follow-up scenarios on simulated services.

`chat-map-participants.test.mjs` independently checks omitted/empty/invalid labels, same-event/person preservation, conservative identical-row removal, conflicting provenance, UUID casing, exact fields, hidden rows, strict versions and stable new identity with real adapters and synthetic storage. `chat-map-participants-model.mjs` lets the actual configured model choose all tools and the final reply, with inference-only network, frozen source pins and hard total/per-case dispatch caps. It separately reports model choices versus component-proven normalization mechanics.

`chat-steering.test.mjs` exercises the production app/runner's active-input admission, native supersession, answer resets, cancellation and cumulative budgets, with synthetic provider timing. It uses the actual Attio request adapter for exact-read permits, reversal corrections, create replay and uncertain-write preservation. `assistant-queue-browser.mjs` also checks the single animated square, black Clear, gray row arrows, stream/HTTP acknowledgement races and retained failed input across desktop/mobile/reduced-motion views.

`chat-steering-model.mjs` and its fixture allow the actual configured model to select initial and corrective map/answer behavior against in-memory storage. Live-model mode is explicit, inference-endpoint-only and source-pinned, with hard12 total/7 per case limits including retries. Self-checks are scripted fixture validation only. The October23 accepted batch used11 requests; a later cancellation-only source delta was independently checked offline. See [verification and limits](../docs/spotlight-steering-verification-2026-10-23.md).

`agent-task-catalogue.test.mjs` executes migration045 in PGlite and the production Node store/runner against131synthetic tasks containing about12.5MB of saved history. It checks service-only grants, scoped metadata and exact reads, Unicode, expiry/lease/revocation, full-original matching, mechanical identity collisions, exact finish freshness, unchanged unrelated rows and safe storage failure categories. The runner test rejects any complete-list call and records only selected history reads. One test exercises the unchanged15second request deadline. These are local SQL and scripted runner checks; they do not establish hosted query speed, actual-model understanding or a live planner outcome.

Current task-store test fixtures expose separate catalogue and exact-read operations. Historical full-history disclosure tests explicitly request detail=full; compact defaults and optional incomplete full reads remain covered separately. Current staged integration tests preserve a newer task unchanged and reject stale resolution before dispatching delete, even when the overall run can finish. Four older integration suites still have24failures reproduced with the pre-storage-change runtime; those failures are not a green acceptance gate for this change.

`provider-fallback.test.mjs` checks ordered second/third-provider recovery for native turns, planning and streaming, per-provider protocol/key/model/audit identity, one deadline, abort/audit/local-validation stops, no replay after HTTP success, JSON-key redaction and a real planner runner with a simulated business operation executed once. Its transports are synthetic; live backup availability requires private credentials.

`agent-task-history-storage.test.mjs` exercises the production store with actual local PostgreSQL, exact compressed-history recovery and corruption, version, lease and source failures. `agent-task-history-pages.test.mjs` checks bounded history/full-task pages and older-task retry selection. `agent-observation-handoff.test.mjs` checks actual handler phase transfer with unchanged budgets. `planner-throughput-model.mjs` uses the configured model and production runner with simulated business services, inference-only network and hard request caps. Scripted checks, real-model evidence and live outcomes remain distinct in the milestone.

October26 publication checks corrected the expired task-history fixture to use a statement-stable clock at the exact24hour lifetime boundary; production expiry checks and existing assertions remain unchanged. Fresh verification is recorded in ../milestones/main-publication-2026-10-26/.

`contacts-sql.test.mjs` executes migration047 in local PostgreSQL through PGlite. It checks flexible contact-field preservation, generated UUIDs, automatic timestamps, backend CRUD, invalid inputs, denied browser access and preservation of an unrelated table. These offline checks do not establish that the migration has been applied to hosted Supabase.

`contacts-tools.test.mjs` independently exercises the real contacts store and request-local tools against synthetic PostgREST: backend CRUD, raw-field preservation, exact read/version guards, private access, bounded literal search, conflicts and uncertain-write replay protection. `contacts-model.mjs` runs the production chat runner with the same simulated persistence. Its `--self-check` uses scripted replies solely to verify fixture mechanics; explicit `--live-model` uses the configured model with pinned sources, an inference-only network allowlist and hard 48-total/8-per-scenario request caps. Private evidence records actual proposals, attempted/applied writes, exact final rows and answers. Hosted contacts are never read or changed by either harness.

`contacts-http.test.mjs` checks actual authenticated Hono contacts routes over the production store and synthetic PostgREST, including six-field projection, preservation, exact versions, session/origin boundaries, validation and honest failures. `contacts-ui-browser.mjs` starts its own local Vite/Hono fixture and installed Chrome to verify the full campus launcher and responsive Contacts interface through real HTTP CRUD. It checks drafts, conflict recovery, explicit field clearing, deletion confirmation, uncertain writes, focus, keyboard shortcuts, inert saved markup and desktop/mobile layouts. Screenshots and private verification records go under ignored `evidence/contacts-ui/`; neither test accesses hosted contacts or invokes a model.

The Contacts browser check also verifies its icon-only rounded-square profile launcher, the absence of an enclosing profile ring, matching pastel highlights, actual hover/focus pixel motion and static resting/reduced-motion pixels. Directory checks keep search, count and pagination visible while only the contact rows scroll, including after selection and the mobile back action.

The Contacts browser regression now exercises immediate inline inputs, dirty Save/Cancel, red square deletion confirmation and approved raised/recessed surfaces through the real browser/API/store over simulated PostgREST. It retains legacy preservation, conflict/uncertain-write, focus/map isolation and mobile coverage; mock-only visual passes remain ignored evidence.

## Treg Contacts import

`treg-contacts.test.mjs` exercises production HTTP/Treg-client/importer/Contacts-store adapters over simulated upstream and PostgREST. It checks exact complete raw provider storage for known and unknown formats, supported-string-only projection, duplicate/human-edit preservation, authentication/input/configuration, costs, cancellation and truthful partial/lost writes. Existing Contacts HTTP/tools tests remain regression coverage.

`treg-call-log.test.mjs` inspects actual private temporary JSONL files and lifecycle ordering. It covers complete bounded nested success/error bodies, secret removal, stage-specific log failures, partial capture, restrictive file permissions, symlinks and progress through more than 1,000 retention entries. Test logging uses isolated temporary directories and cleanup; no paid/live provider call or real database mutation is made.

`contacts-cache.test.mjs` executes actual049in PGlite and the real Google-local sender/cache helper over simulated PostgREST. Gmail subscription tests cover separate cache-before-enqueue, duplicate/uncertain replay, metadata fallback, cancellation and lease/cursor recovery. No model or live business network is used. Gmail collector package expectations include contacts-cache/mailbox modules; unrelated Discord closure expectations remain separate.

## Separate Gmail cache enrichment

`treg-enrich.test.mjs` verifies the production email-only Treg client and real private file logs over simulated provider transport. `gmail-enrichment.test.mjs` exercises the production engine with explicit in-memory atomic cache contracts and real client/Contacts adapters. `gmail-enrichment-sql.test.mjs` loads actual Contacts047, intake049 and service050 SQL, bridges fixed PostgREST calls to local database functions, and verifies raw-only unchanged cache input, metadata-only jobs/state, atomic Contacts completion, raw data, source/lease fences, budgets, retries and private grants. These are local/simulated checks, not hosted PostgreSQL lock or rollout evidence.

`contacts-search.test.mjs` exercises actual048SQL with pg_trgm/fuzzystrmatch, service-role grants, exact-first fuzzy/full-name matches, literal safety, AND filters, stable sorting/pagination and preservation. The browser regression includes filter Apply/Reset, funnel/focus states and Spotlight motion/lifecycle. Configured-model cases use BOTH real Contacts/Attio adapters over simulated storage and inference-only networking to verify default lead routing and explicit Attio use.

`treg-tools.test.mjs` exercises the two lookup-only Treg tools through production clients, chat and authenticated API surfaces with simulated upstream transport. `treg-tools-model.mjs` is a bounded configured-inference evaluation with simulated business services; its evidence distinguishes actual model behavior from offline fixtures and live deployment.

`gmail-enrichment-schedule.test.mjs` verifies New York summer/winter/DST gating, no runtime creation off-hour, finite drain stop/cancellation and resource cleanup, and actual SQL-backed multi-batch processing under a cache-write-denying trigger. These tests use simulated Treg, not a paid scheduled provider run.

`tests/treg-dormant-routes.test.mjs` exercises the four dormant Treg clients and explicitly registered isolated HTTP handlers with simulated provider responses and a real temporary private logger. It checks meaningful successful/null/unknown/pending results, validation/auth/origin, bounded single-call costs/idempotency/logging/errors/cancellation, and actual main-app route/catalogue absence. It makes no paid provider, model or database calls. Source and verification receipts are recorded in the milestone.

`contact-chat-context.test.mjs` exercises selected-contact metadata through browser transport, actual HTTP/runner native and fallback paths, original-user authority, byte limits and steering subject/retry checks. Temporary private browser/model harnesses under ignored `evidence/contacts-footer-layout/` additionally cover split Notes/footer layout and Contacts-to-Flock handoff; actual configured inference uses only simulated business data with a hard request cap.

planner-presence-behavior.test.mjs checks the alias migration against the current full schema and exercises standalone presence safety through production adapters with simulated storage. Configured-model evaluation evidence is separate under ignored planner-presence-fix evidence.

gmail-send.test.mjs and gmail-send-sql.test.mjs exercise actual MIME client and production store/service/API/tools against injected Google transport and local SQL, including permissions, concurrency, restarts and unknown outcomes. They send no real email.

`treg-save.test.mjs` verifies separate native Contacts imports from scoped Treg result references, exact raw/lookup-email preservation, existing human data, versioned edits/deletion, replay, uncertainty, logging fences and memory bounds. `fixtures/treg-save.mjs` uses production clients/runner/store with simulated provider and PostgREST transports. `treg-save-model.mjs` evaluates actual configured inference with an exact endpoint allowlist and persisted cumulative request cap; `--self-check` tests fixture mechanics only. Private reports retain interrupted/budget-limited cases honestly; see the rolling milestone for accepted behavior and remaining limits.

The dormant Treg route checks cover numeric company employee counts, strict invalid-value rejection, unchanged native logging and the client-to-HTTP text contract. Original provider-response replays remain in ignored private evidence.

The dormant Treg lookup checks are split by responsibility: `treg-dormant-routes.test.mjs`
checks fixed clients, selectors, typed results, errors, bounded responses and private
logs; `treg-dormant-http.test.mjs` checks optional HTTP registration, authentication,
Origin, public projection, durable-log failure/cancellation and default-app 404s.
`fixtures/treg-dormant.mjs` supplies only synthetic provider, session and temporary
private-logger boundaries. `treg-branddev.test.mjs` independently exercises the
selected company request variants and native field projection. These suites make
no live or paid calls and do not activate the dormant routes.
