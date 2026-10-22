# Milestone journal

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

M14: m14-supabase-setup tracks preparation versus authenticated connection; not complete until scoped connectivity verified.

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
