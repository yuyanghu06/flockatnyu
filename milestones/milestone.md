# Current milestone and session handoff

## Latest: development snapshot requested; backend work stopped

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
