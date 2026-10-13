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
