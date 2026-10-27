# Milestone journal

`prompt-release-2026-10-27/` records isolated release scope, exact checked commits/artifacts, rollback IDs and actual rollout verification.

Markdown prompt migration, actual-model checks and Contact/Calendar wording corrections are recorded in `milestones/prompt-markdown-2026-10-27/`, `milestones/prompt-markdown-live-2026-10-27/` and `milestones/prompt-clarification-completion-2026-10-27/`. Runtime instructions live in root `prompts/`; deployment status is recorded in the current release milestone.

`treg-branddev-default/` tracks the selected company provider and native adapter, with dormant routes kept inactive.


`treg-company-provider-compare/` tracks the eight-provider, four-company comparison with private evidence and unchanged application settings.


`treg-company-count-fix/` tracks the numeric employee-count compatibility repair and saved-response verification without route activation.


`treg-exa-default/` tracks default search and native read compatibility; `treg-built-route-test/` tracks bounded tests of only existing selected-provider routes.


`treg-search-engineers/` tracks the bounded live people-search comparison; Contacts/cache and daily runtime stay unchanged.


`treg-default-save/` tracks prompt-led people discovery, enrichment and separate native Contacts imports.

`gmail-enrichment-batches/` records the daily 50-email batch cap, sequential requests, five-second pacing and independent local/live verification.

`daily-tomba-default/` records the daily-only Tomba-first/Apollo-fallback release and independent source/live verification.

`treg-provider-benchmark/` tracks the14saved-match import and bounded20-email/eight-provider comparison; daily runtime stays unchanged.

`treg-contact-diagnosis/` tracks the native Treg shape/email mismatch and requested Contacts loading/idle-animation fixes.

`gmail-enrichment-providers/` tracks the daily-only Apollo-first/two-provider change; CSV rerun and website changes were cancelled by the user.

`treg-csv-email/` tracks the bounded email-only CSV test, existing batch interface and private live evidence.

`treg-contacts/` tracks the bounded authenticated Treg-to-Contacts import, simulated verification and credential limitation.

`planner-manual-processing-2026-10-26/` tracks the user-authorized push and manual pending-work review; diagnostic logs and unresolved work are preserved.

The selected planner fixes are locally complete with independent acceptance. Their guide distinguishes final offline checks, bounded actual-model decisions, earlier full-conversation limitations and held work; no deployment is claimed.

`planner-selected-fixes-2026-10-26/` tracks only the user-selected planner remedies, explicit held work, and independent verification.

The follow-up in `planner-logging-review-2026-10-26/debug-causes.md` records actual failure causes, offline reproductions, five safe current Discord checks and qualified unknowns. It changes no runtime behavior.

`planner-logging-review-2026-10-26/` records the twelve-hour planner problem review, independent recount, plain-English findings and evidence limits. No runtime changes.

The October25 planner queue-clear follow-up is recorded in `planner-48h-review-2026-10-25/`: explicit deletion authorization,574originals/184tasks removed, old lease invalidated, worker restarted and all work queues verified empty.

`planner-48h-review-2026-10-25/` records the October23–25 operational review, restored model responses, remaining task-save failures, queue limitations and independent recount. No runtime changes were made.

`milestone.md` is the authoritative rolling state and next-session handoff.
`to-do.md` tracks priorities, completed work, and explicit cancellations.
`history/` holds append-only records of every meaningful role pass.
`m0-agent-workflow/` describes workflow setup acceptance.
`m1-campus-map/` describes the local map implementation milestone.

The orchestrator is the sole writer of shared journal files and serializes
specialist reports into them. New multi-pass milestones receive their own folder
guide; their current status remains authoritative in `milestone.md`.

m2-campus-refinement/ tracks user-directed camera bounds, wider coverage and photo-informed Paulson modeling.

M3 tracks campus detail models, Gould Plaza and Tech@NYU color proposals in m3-campus-details/.

M4 tracks Kimmel, corrected Silver Center identity and plaza planting; see m4-campus-details/.

M5 tracks reauthorized Courant/Stern window details with unchanged colors in m5-window-details/.

M6 tracks attributed streets, sidewalks and mapped park paths/surfaces; the user's authorization supersedes the earlier road exclusion.

M7 tracks the user-reported asphalt flicker during zoom and pan.

M8: m8-gcasl tracks the dedicated Global Center model and outstanding visual acceptance.

M9: m9-presentation tracks map-only styling, effects, atmosphere and camera constraints.

M10: m10-park-vegetation tracks deterministic plantings over actual mapped park coverage.

M9/M10 resumed after a blocked human-requested checkpoint. See rolling snapshot for current camera research and vegetation integration/verification.

M11: m11-atmosphere-navigation tracks shared sky/fog blend, reverse focus exit, screenshot-guided default and neutral Union Square context restoration.

M12 memory and frame workload tracking lives in m12-memory/.

M13 loading screen tracking lives in m13-loading/.

M14: m14-supabase-setup records completed current-Mac registration, read-only OAuth and live scoped query verification; earlier Windows preparation is historical.

M15 assistant scaffold and the dev snapshot publication are tracked in the rolling snapshot; Git publication history records the successful origin/codex/dev push.

M16: m16-discord-archive tracks accepted local archive/admin/tool implementation, independent SQL/browser evidence and pending live launch.

M17: m17-discord-launch tracks full-history local collection, hosted schema and the dedicated Railway service. Completion requires actual bot configuration/backfill and an observed Railway run/schedule.

M18 tracks automatic Discord discovery, inherited blacklists, Discord-only reset and original time-tier storage with images/embeddings deferred.

M19: m19-building-views tracks screenshot-derived camera profiles and focused outward wheel return from anywhere on screen.

M20: m20-loading-gears tracks the reference loading gears, user feedback for original size shifted left and one right CTA, composited motion and truthful entry/error verification.

M20 adds authorized Luna summarypasses overM18source-isolatedtimegroups; itsguide is m20-discord-summaries/info.md. Current rollingstate distinguishes rawgroups, actualAIgeneration andhostedworker acceptance.

M21: m21-map-input tracks stripped loader/automatic entry, WASD, Bobst/Silver pullback and Gould under Stern; it supersedes the M20 visual entry screen.

The October 13 functionality audit distinguishes the visible map/assistant UI,
recorded operational Discord pipeline and unfinished member auth/summary retrieval.
Its three read-only review/verification passes are linked at the top of the snapshot.

M23 m23-smooth-wasd/ tracks eased keyboard travel and increased cruising speed,
with bounds, input handoff and frame-rate/browser verification.

M24 m24-spotlight-assistant/ tracks the floating query-first assistant and paired local frontend/API startup.

M25 m25-live-discord-summaries/ tracks live-firstbot tools,summary-onlyDiscordstorage andsummaryvectors; M26 m26-google-connector/ preparesclubGoogleOAuth/Gmail/Drive runtimeaccess.

avatar-assets/ records the local 26-person profile-artwork delivery, requested likeness revisions and artifact verification.

m27-miro-sync/ tracks the dedicated daily Miro ingestion table/service and direct read-only model board tools; see the rolling snapshot for authorization and deployment state.

m28-schema-cleanup-audit/ records the completed assessment of Miro columns and obsolete Discord/knowledge tables. Implementation is separate from the read-only proposal.

M29 (`m29-discord-live-only/`) completes user-directed removal of durable Discord
summaries/accounting, retaining one metadata/view policy table and live bot content.

M32 records browser timezone context and deterministic Discord calendar scans.

M33 (`m33-agent-input-cache/`) tracks the local two-column shared input-cache
migration and its independent SQL/access verification.

M34 (`m34-agent-automation/`) and M35 (`m35-gmail-subscription/`) track local
cache-driven agent handlers and Gmail subscription code versus actual activation.

M36 collector cleanup and M37 tool organization are complete; see the rolling snapshot and docs/cleanup-handoff.md for current parallel-work boundaries.

M40 (`m40-assets/`) tracks consolidation of source models, datasets, avatars and references into root assets/ with binary preservation and map loading verification.

M41 (`m41-brand-loader/`) tracks the approved flat pastel @ as a native looping startup animation, including real readiness, reduced-motion and failure acceptance.

map-presence-ui/ tracks five temporary Bobst occupants and protected database-backed circular portrait markers without changing map appearance.

M42 favicon and M43 smooth reveal track the round static browser icon and uninterrupted cinematic startup; see their info.md guides and rolling snapshot.

map-building-write-scope/ tracks the user-required fixed location catalogue and people_here-only runtime mutation boundary.

map-presence-labels/ tracks explicit table-stored JSON labels and removal of backend-generated display captions.

favicon-small-mark/ tracks the user-confirmed smaller favicon glyph inside the retained rounded-square badge.

M44 periwinkle loader was a rejected design trial; previous v5 runtime restored. Its folder/evidence distinguish technical checks from aesthetic rejection.

M45 completes the approved raised pastel loader and matching raised SVG/ICO favicon at final80% mark scale. See the milestone guide and final independent evidence.

M46 tracks the user-requested white hover perimeter that disappears on building selection; no floating marker.

M47 (`m47-selection-indicators/`) tracks the persistent selected-building outline plus ground footprint ring, including smooth edges and a subtle entrance. M46's final accepted state is the steady white surface highlight; its earlier perimeter-only scope was superseded.

map-building-activity/ tracks the capped base-focus avatar layout, event card and hosted024 flattened event storage. Direct browser and aggregate hosted evidence are in evidence/map-building-activity/.

structured-map-prompt/ tracks runtime shared JSON contracts, evidence-based map interpretation and approved two-hour defaults without tool/deployment activation.

map-event-attendees/ tracks optional event attendee IDs and right-side portrait UI; hosted status is recorded in the rolling snapshot. Separate-table normalization and automatic map presence remain deferred.

`events-relationships/` tracks normalized event/participation/location storage and the verified map cutover, superseding prior dedicated-table deferrals.

Miro MCP integration passes track the shared chat/update-agent calendar reader, separate application OAuth and live table evidence acceptance.

`bug-reports/` tracks the bounded structured chat bug-report table/tool and verified hosted schema.

miro-mcp-live-only/ tracks accepted live MCP access for both agents and removal of REST/snapshot storage.

`long-term-memory/` tracks the automatically maintained shared chat note and small hosted schema.

`agent-prompts/` tracks calm chat/source routing, leadership privacy and source-backed chat/autonomous map synchronization, including independent tests and configured-model behavioral evidence.

agent-prompts/ is complete for bounded prompt/runtime policy and synthetic-source configured-model verification. Worker activation/live mutation pilots remain separate; milestone.md records precise acceptance and retained failures.

miro-quota/ tracks quota-aware official MCP reads and protected chat capacity; runtime/test/release state remains in the rolling snapshot.

chat-production-fixes tracks bounded report reliability, current-chat named attendance and file uploads with isolated release verification.

production-map-refresh/ tracks the current hosted map deadline repair, request-local source checks and automatic avatar refresh acceptance.

model-audit tracks private accounting/output logs for both chat and planner with seven-day retention and no source-input archive; independent and live acceptance remain in the rolling snapshot.

`discord-chat/` tracks approved eboard interaction implementation, shared assistant execution and trusted caller context.

source-timeouts/ tracks the authorized sixty-second shared source/tool deadline release and independent acceptance.

collector-crash-logging/ tracks privacy-preserving stage/code diagnostics for the Discord listener and its live release verification.

`morpheus-harness-research/` records the read-only upstream harness comparison; recommendations do not authorize implementation.

`chat-limits/` tracks the shared30round/30call change, independent verification and the Railway-blocked rollout with five-minute Discord deadlines.

`harness-reliability/` tracks bounded model retries and queue isolation/quarantine implementation.

`personal-location-behavior/` tracks source-backed personal-location create-if-missing guidance and synthetic SQL/map/model verification; the future time selector remains notes-only.

`storage-avatars/` tracks private Supabase portrait storage, authenticated byte proxy, guarded profile URL migration and removal of frontend-bundled people images after acceptance.

`tool-health/` tracks live tool-failure diagnosis, empty-result progress and native Drive activation corrections with separate hosted acceptance.

683-broadway/ tracks source-aligned corner-tower modeling and browser acceptance.

`discord-image-context/` tracks fresh authorized Discord image attachments into request-local multimodal chat and independent acceptance.

`tool-failure-logging/` tracks historical failure review, content-free cause logging and the user-requested saved Calendar location receipts with explicit hosted activation state.

active-event-indicators/ tracks current-event visual signals and the bounded Go Greek preview.

`active-event-indicators/` records original-site yellow markers, steady current-event building glow and the exact local-only MCP-seeded Go Greek preview. Current acceptance and expiry are in milestone.md.

`attio-integration/` tracks scoped CRM route/tool implementation and independent verification.

`building-focus-framing/` records shared responsive camera/card space, complete-model fitting and smooth lens restoration, verified across all ten landmarks at three viewport sizes.

`combined-release/` tracks the all-working-tree Railway rollout and logicalGitHubpublication, including requiredschema/privateconfiguration, sanitizedcontexts, hostedchecksandportraitcutover.

`discord-blacklist/` tracks automatic current-catalogue grants for chat and the update agent, non-Discord grant preservation, dynamic scoped claims and empty-scope retention maintenance.

`discord-concurrency/` records the completed live10total/5member Flockbot capacity change, parser/test boundaries and verification limits. The current snapshot links the exact release receipt.

`discord-drafts/` tracks request-local, draft-only messages addressed to another eligible Discord channel, with no delivery or source-scope expansion.

Latest update-agent startup clarification: [read-only operational pass](history/2026-10-22_14-55-42-670919-orchestrator-update-agent-startup-explained.md); startup versus per-batch behavior and actual production overrides are recorded without source content or secrets.

`calendar-complete-receipts/` tracks provider-confirmed event details and explicit bounded receipt projection through Calendar tools and model context.

Latest update-agent accounting inquiry: [read-only attribution pass](history/2026-10-22_14-59-46-542154-orchestrator-update-agent-usage-audited.md); current implementation work remains in milestone.md and private numerical results stay outside tracked evidence.

`chat-map-clarification/` tracks ask-name prompting and the clarified map request write route; current status stays in the rolling milestone.

Update-agent replay mechanisms independently reviewed: [operational pass](history/2026-10-22_15-41-42-456262-planner-update-agent-replay-source-reviewed.md). Current runtime/release truth remains in milestone.md.

Update-agent effects and repeated work diagnosed: [operational pass](history/2026-10-22_15-41-42-457964-orchestrator-update-agent-effects-audited.md). Current runtime/release truth remains in milestone.md.


staged-calendar-pipeline/ tracks Calendar-first personal activities, deterministic two-calendar map projection, task persistence and bounded final-agent processing; current release state is in milestone.md.

weekly-bug-audit/ tracks the read-only weekly source/operational report and private artifact verification.

Calendar rejection/tool-budget advisory: [read-only diagnosis](history/2026-10-22_15-47-27-920764-orchestrator-calendar-rejection-and-timeout-diagnosed.md); staged implementation/release remains separately tracked.

`simplified-update-agent/` tracks removing automatic worker Miro/model synchronization duties while preserving deterministic Calendar/cache work and exact queued Gmail/Discord event provenance.

manual-planner-start/ tracks the operator API and queued-only exact-channel forced cycle, SQL dispatch/metadata readers, independent verification and reviewed rollout.

`tool-error-continuation/` tracks model-visible tool failure replies and the separate audit of the eight-call reply limit, preserving real run controls and successful-write accounting.

plain-task-cache-read/ tracks separating saved task reads from agent-selected standard source/action tools.

`test-suite-audit/` records the repository test inventory and cleanup review; the detailed dated report is `docs/test-suite-audit.md`.

`test-suite-cleanup/` records the applied maximum-safe test reduction after the audit, including retained current behavior and independent acceptance.

worker-call-limits/ tracks the explicitly selected16reply/64stage worker release.

chat-attendance-normal-tools/ tracks removing the old attendance route; prompt-audit/ tracks the subsequent user-requested full runtime/tool instruction audit.

`test-phaseout/` records subsequent current-rule prompt/catalogue/contract reductions after the initial cleanup; the dated result report is `docs/test-phaseout.md`.

`test-priority/` records the essential/useful/historical/review classification of the accepted 2,353-case snapshot; it does not equate lower priority with safe deletion.

Completed essential-test priority: 1,627 essential / 548 useful / 139 protected historical / 39 review out of the accepted 2,353-case snapshot. See test-priority/info.md and docs/test-priority.md.

`contextual-event-attendance/` tracks existing-event lookup, contextual timing and the exact GoGreek duplicate repair.

Latest Flock continuation is `live-planner-calendar-tests/handoff-2026-10-22.md`; user requested immediate documentation and stopping all other work. It supersedes earlier acceptance/cleanup assumptions.

The latest GoGreek attendance resume continues the live-planner-calendar-tests milestone from codex/dev; current acceptance remains incomplete.

October23 chat-map diagnosis records current web read timeouts and duplicate suppression; it does not change the separately managed worker repair or claim a deployed fix.

The October23 isolated-tool instruction pass records a project rule only: workflow sequencing belongs in prompts; runtime correction remains separate.

`tool-isolation-audit/` records the complete read-only43name audit and candidate comparison under the October23 isolated-tools rule.

The tool-isolation-audit restart handoff points to the current isolated implementation and accurately records unfinished final workflow tests/integration.

2026-10-23: isolated tool verification resumed; deployment authorized after acceptance. See 2026-10-23_16-07-19-827953-orchestrator-tool-isolation-resumed-final-checks.md.

October23: isolated-tool current workflows accepted/integrated; deployment authorized and next. Verification and immutable tester/evaluator/integration entries are linked from the rolling milestone.

October23: isolated tools are accepted, integrated and deployed (web33f90fb7 / workerae88da62). Saved-map read verified1.595seconds; see rolling milestone and tool-isolation verification report for exact evidence/limits.

October23: main fast-forwarded to the deployed codex/dev release; branch synchronization recorded in the rolling milestone.

`chat-time-spotlight-queue/` tracks server-converted chat times and queued Spotlight follow-ups; actual acceptance remains in the rolling snapshot.

October 23 planner-call review records production aggregate outcomes and representative follow-up starvation without retaining private audit bodies or changing runtime behavior; see the rolling snapshot and linked immutable review.

The follow-up planner review uses the verified latest-worker activation boundary and run-start ownership, excluding older-release failures and distinguishing initial completion from follow-up completion. The exact window and limits are in the rolling snapshot and linked history.

The excessive-call trace follow-up distinguishes complete retained tool proposals/lifecycle records from unavailable original transcripts and reasoning. Private trace exports remain ignored; committed journal evidence stays content-free.

planner-followup-focus/ tracks current-cycle task priority, one/two-task follow-up work and compact saved-history disclosure with independent actual-model verification.

`chat-map-participants/` tracks omitted-label preservation and conservative duplicate-participant removal in chat, with independent simulated-storage verification.

October 23 at 7:05 PM: the post-focus planner status review distinguishes an online worker, five completed initial runs, remaining preparation/completion failures and 131 pending tasks; exact cohort, cutoff and limitations are in the rolling snapshot and linked history.

October23 post-release diagnosis: two startup and seven initial-finish failures share full saved-task loading. A pure SELECT reproduction took16.5seconds for131tasks. Historical error subtype remains uncertain; no fix was implemented. Compact model views do not reduce this backend snapshot. See the rolling milestone and linked planner/evaluator/investigation entries.

`spotlight-steering/` tracks black Clear, the restored animated square, removal of header Stop and explicit queued-text steering. Its evidence distinguishes scripted/browser mechanics, actual-model simulated-data choices and hosted release checks.

October23 recommendation: small task catalogue plus targeted complete saved-task reads across all five list sites; current checks and retained tasks stay intact. Recommendation only; implementation and measured query/runner acceptance remain pending. See the rolling snapshot.

planner-task-storage/ tracks the accepted catalogue/exact-read worker fix; migration045 and runtime/test work are in progress. Hosted migration access and release remain pending.

October23 implementation: all five backlog loads replaced; local PostgreSQL/runner checks and API build pass. Hosted metadata query-shape137tasks/88,583B/722.196ms. Final frozen review and migration/worker release remain pending.

October23 final evaluator accepts catalogue/exact-read release after306frozenchecks and exact local migration receipt/grants. Hosted migration and worker rollout are next; no hosted success is claimed yet.

October23: hosted045/receipt/functionACL/RESTverified; isolatedworkera34ade2f isSUCCESSat19:52:01NewYork. Bothcurrent/frozengates306pass. Ordinaryrunobservation andsourcepublication remain.

model-usage-review/ records the October24 read-only production usage recount since the first Thursday worker rollout, with independent review and explicit unpriced/local-test exclusions.

October25 latest rejected map upsert, recovered retry and separate cancelled-event observation are documented in map-upsert-diagnosis-2026-10-25/.

October25 follow-up confirms that canonical Calendar cancellation is restored by synchronization and hides saved attendance; see map-upsert-diagnosis-2026-10-25/.

`go-greek-removal-2026-10-25/` tracks retirement of the temporary popup and its attached Flock data; source originals and unrelated records are preserved.

The user-requested active Calendar replacement and Kimmel attendance correction is tracked in map-calendar-relink-2026-10-25/.

The active Calendar correction is applied and verified through the hosted map API; see map-calendar-relink-2026-10-25/.

October25 post-clear explanation distinguishes zero new queued inputs from saved-task history growth and the missing no-change resolution for saved reviews.

October25 Calendar cancellation/replacement inconsistency is recorded in the hosted bug tracker, persistent notes and the open backlog; incident correction does not close the general bug.

October25 4:32PM recheck records41new pendingDiscord inputs and continuing worker progress after the earlier empty queue; saved follow-up count unavailable.

`planner-throughput-2026-10-25/` documents the live two-input cap, historical tuning, independently measured runtime costs and unresolved completion failures without live changes.

`planner-throughput-fix-2026-10-25/` tracks authorized save/read fixes, independent model/storage verification and later batch-five worker rollout.

main-publication-2026-10-26/ records the requested local diff, independent checks/review and normal publication to main, preserving unapplied cleanup046 and open issues.

The October23 Railway inspection records current production log findings only; stopped product work remains stopped.

October 26 folder-rename verification records portable application paths, independent local builds/serving checks, an unrelated stale collector test expectation, and the repaired local Railway folder association. Production services were not changed.

Folder rename/main integration is complete: local Railway link repaired, main 4e974d0 integrated with all uncommitted records preserved, independent review accepted and fresh local checks recorded. See folder-rename-main-integration/info.md and the current snapshot.

`contacts-crm/` tracks the new private contacts table, SQL verification and hosted application.

`contacts-tools/` tracks model contact operations and real-model evaluation on simulated storage.

`contacts-ui/` tracks the adjacent Contacts launcher, manual contact UI/API and source-based site style guide.

`contacts-local-load/` records the stale paired-dev API failure, exact restart and actual read verification.

`calendar-ui-mock/` tracks the separate local-only calendar design draft.

`contacts-design-mock/` replaces the cancelled calendar draft with an isolated Contacts design playground.

`contacts-site-release/` records promotion of the approved Contacts mock into the real website and a compatible web-only release.

`treg-call-logging/` tracks private full Treg request/response/import logging, secret removal and simulated verification.

`gmail-cache-enrichment/` tracks the separate Gmail-cache enrichment worker and its pending external cache contract.

`contacts-cache/` records the minimal inbox-sender staging table and separate Gmail cache step, replacing the direct Contacts intake plan.

`contacts-search-filters/` tracks shared fuzzy/filter search, manual-lead routing, funnel/focus treatment and Spotlight-matching Contacts motion, separate from completed inbox cache intake.

`treg-agent-tools/` tracks separate lookup-only Treg search and array email enrichment in shared chat.

`treg-dormant-routes/` tracks four prepared Treg lookup handlers that remain outside the running application and tool catalogue. Its acceptance includes independent operation/error/privacy tests and actual package exclusion; current status lives in the rolling milestone.

`contacts-footer-clipping/` records the CSS-only upward positioning of existing editor actions, browser geometry/scroll checks and frontend-only release.

`contacts-flock-context/` tracks replacing the sticky Notes overlap with separate layout areas, the Flock it! saved-contact chip and directory refresh. It distinguishes synthetic UI/transport tests, actual configured-model evaluation and hosted release checks.

The planner-presence-diagnosis folder records diagnosis, actual-model corrections and the accepted worker-only standalone-presence release; it distinguishes simulations/startup verification from an unverified actual report replay.

`source-cleanup-ci/` tracks source grouping, server-only HTTP routes and enforceable local/GitHub checks.

`server-cleanup/` records grouping the backend, porting the remaining provider
changes, the tools/API audit and the user-requested stop to final testing.

`prompt-release-2026-10-27/` records the pushed Markdown migration/two prompt fixes, rejected and corrected worker image, exact payload parity with the separately authorized full-tree rollout, actual deployment IDs and independent hosted auth/assets checks. Worker remains inactive.
