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
