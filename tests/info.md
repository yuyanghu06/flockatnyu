M39 publication verification: fresh14 keyboard,21 camera,16 interaction and13 offline Chrome assistant checks pass. The old interaction count now explicitly excludes Lipton; Spotlight uses the current live-tool context and an injected source fixture instead of the retired knowledge-search RPC. Actual Hono auth/tool validation, Vite proxy, provider streaming and UI are exercised without live source/model calls. Prior M38 full581/581 and both builds cover unchanged product source. Fresh evidence: evidence/m39-working-tree-publication/.

# Current backend and collector verification

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

# Browser acceptance checks

`map-browser.mjs` exercises the production campus preview using installed Chrome
and Playwright. Run after `npm run build` with `npm run preview -- --host 127.0.0.1`
running; the default URL is http://127.0.0.1:4173. Evidence is saved separately under
`evidence/m3-campus-details/` by default. M1 and M2 evidence remain immutable.
These checks use real pointer controls and rendered
assets, with the read-only debug interface for numeric measurements.

`source-geometry.mjs` independently reads the source replacement tile and records
triangle counts, connected shells and world bounds for comparison against the
loaded map. `map-failures.mjs` checks unavailable assets, resizing during delayed
loading and unavailable WebGL. `map-performance.mjs` measures the default Chrome
GPU separately from the explicitly software-rendered acceptance suite.

`map-refinement.mjs` covers M2's starting zoom, bounded free camera, expanded
coverage and procedural Paulson interactions. `map-boundary-zoom.mjs` checks
maximum wheel zoom at a pan boundary. `map-paulson-views.mjs` captures three sides
and measures performance for targeted visual fixes without repeating unrelated
navigation tests.

`map-details.mjs` is the current M3 acceptance: all nine locations, model contracts,
multiple views, camera regression, mobile layout and hardware performance.
`details-geometry.mjs` independently decodes source tiles, verifies removals leave
neighbor triangles unchanged and checks retained source tower vertices.
`gould-front-view.mjs` captures the low front view needed to inspect stair grounding.

Run from the repository root in a second terminal after starting the preview:

```powershell
node tests/map-browser.mjs
node tests/map-failures.mjs
node tests/source-geometry.mjs
node tests/map-performance.mjs
node tests/map-refinement.mjs
node tests/map-boundary-zoom.mjs
node tests/map-paulson-views.mjs
node tests/map-details.mjs
node tests/details-geometry.mjs
node tests/gould-front-view.mjs
```

Browser scripts default to installed Chrome at
`C:/Program Files/Google/Chrome/Application/chrome.exe`. Set `MAP_URL` to test a
different local preview URL. Run the performance checks sequentially to avoid
competing browser workloads. Hardware results reflect the machine under test.
The baseline scripts accept `MAP_EVIDENCE` for an alternative output directory;
do not point them at historical M1 or M2 evidence. Fixtures reflect nine current
landmarks, 700-meter
navigation range, the 91-meter Paulson model and a Bobst network failure probe
(Paulson is procedural and does not request its preserved source GLB).

Palette evidence utilities: node tests/palette-capture.mjs captures the real map backdrop; node tests/palette-check.mjs checks and captures the built docs proposals. Run from repository root with preview on4173.

M4 acceptance: node tests/map-m4.mjs; evidence and report in evidence/m4-campus-details/. Historical milestone scripts retain their original landmark fixtures.

M5: node tests/map-m5.mjs uses frozen before poses, verifies source geometry/material hashes and exact palette reuse, and captures final window details. Evidence: evidence/m5-window-details/.

M6: tests/map-m6.mjs covers snapshot projection, baked surface bounds/fountain clearance, before/after street and park views, landmark/camera/mobile behavior. Evidence includes after-results.json (10/10) and after-final-results.json (3/3 final rebake checks).

M8: global-center-geometry.mjs verifies exact replacement ownership, source preservation and static integration offline (12 checks).

M9: map-presentation.mjs checks camera samples/actual OrbitControls, effects lifecycle, atmosphere shader hooks and static UI/context contracts without a browser.

M9: camera-focus.mjs verifies spring motion, front framing, focused-only tilt and equal-time30/60/144Hz behavior; map-interactions.mjs tests wheel/click/drag and native pinch routing. M10: park-vegetation.mjs independently checks placement/exclusions, source hashes and baked geometry. These tests do not launch a browser.

M11 updates camera-focus/map-interactions/map-presentation for reverse overview, wheel traces, analytic fog/sky and screenshot default. union-square-context.mjs audits the two omitted baked models and preserves adjacent city geometry.

M12: map-memory.mjs verifies exact context attributes, safe ownership and hover transform propagation.

M21 map-startup.mjs replaces the retired loading-screen.mjs with9pure/DOM/source checks for truthful automatic readiness and retry.

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
