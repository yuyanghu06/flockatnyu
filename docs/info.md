The [essential-test review](test-priority.md) classifies every case in the accepted 2,353-case phase-out snapshot; [the complete CSV](test-priority.csv) records reasons. Priority judgments are separate from safe-deletion proof and from later concurrent suite changes.

The selected Contact clarification and Calendar completion prompt corrections are verified in `milestones/prompt-clarification-completion-2026-10-27/verification.md`. Both original actual-model reproductions pass; private raw results retain two nonblocking oracle/efficiency qualifications.

Live-model checks of the Markdown migration are recorded in `milestones/prompt-markdown-live-2026-10-27/verification.md`: actual inference, simulated services, six semantic passes and two unresolved behavior failures. This is separate from production deployment or live-service workflow acceptance.

Runtime prompt wording lives in the root [prompts/](../prompts/info.md) tree. Chat/update guides explain behavior and assembly; Markdown assets are the editable runtime instructions. Migration evidence and existing limits are in the prompt-markdown milestone.

Markdown prompt migration, actual-model checks and Contact/Calendar wording corrections are recorded in `milestones/prompt-markdown-2026-10-27/`, `milestones/prompt-markdown-live-2026-10-27/` and `milestones/prompt-clarification-completion-2026-10-27/`. Runtime instructions live in root `prompts/`; deployment status is recorded in the current release milestone.

The [application prompt audit](prompt-audit.md) inventories active chat, worker, helper, skill and tool instructions, records corrected mismatches, real-model behavior checks and separate backend follow-up.

The [further phase-out](test-phaseout.md) records the next32case removals and retained behavior. Its [current CSV](test-suite-inventory-after-phaseout.csv) supersedes prior inventories for current counts.

The [test cleanup](test-suite-cleanup.md) records applied removals, retained behavior and current verification. The [after-cleanup CSV](test-suite-inventory-after-cleanup.csv) supersedes the earlier inventory for current case counts.

The [test-suite audit](test-suite-audit.md) records the October 22 case inventory, historical tests, safe deletion candidates and actual failures. Its [CSV](test-suite-inventory.csv) gives per-file counts; these are dated audit evidence, not a promise that later edits keep the same count.

# Project documentation

The [milestone snapshot](../milestones/milestone.md) and [to-do list](../milestones/to-do.md) hold current implementation/evidence and unfinished work. [Immutable history](../milestones/history/info.md) preserves previous decisions. Guides describe current contracts; historical commands are not operational instructions.

The Discord chat and live-only guides describe the035discovery availability repair, applied as20261019193035 with verified base-channel recovery and refresh continuity. Follow the milestone receipt before treating that repair as live.

## Backend and integrations

- [assistant-backend.md](assistant-backend.md): chat agent, local API, streaming, source scope and runtime boundaries.
- [backend-direction.md](backend-direction.md): current product/service architecture.
- [discord-live-only.md](discord-live-only.md): bot-only content reads, request-memory summaries, timezone behavior and the single metadata table.
- [discord-launch.md](discord-launch.md): supported metadata/live-access operations. [discord-archive.md](discord-archive.md) points to retired designs and immutable cutover evidence.
- [database-tables.md](database-tables.md): the five current service-only tables.
- [google-connector.md](google-connector.md): account-authorized Gmail/Drive tools and Gmail receiver setup/status.
- [agent-automation.md](agent-automation.md): update agent, temporary input cache, per-batch Miro preparation, fixed-target Calendar tools, prompt and activation boundaries.
- [miro-sync.md](miro-sync.md): scoped board ingestion and direct read-only tools; [miro-api-research.md](miro-api-research.md) records API research and coverage limits.
- [schema-cleanup-audit.md](schema-cleanup-audit.md): historical pre-cleanup assessment; follow the milestone and current table guide for applied state.
- [supabase-mcp-setup.md](supabase-mcp-setup.md): verified current-Mac developer connection and setup history, separate from runtime credentials.

Railway production contains the password-gated website/chat API, enabled update-agent worker, continuous Discord collector and Gmail collector. The old Miro sync service is retired; both agents read official MCP live. Actual processing and Calendar/map projection receipts, current releases and remaining source outages live in the rolling milestone. Integration owners maintain their own guides; shared workflow/journal changes belong to the orchestrator.

## Map, design and workflow

[agent-workflow.md](agent-workflow.md) explains role ownership and handoff; `templates/` supplies assignment, report and history formats. `initial-map-prompt.md` is the original implementation request, not an implementation claim.

Building reference guides record inspected sources, placement/geometry contracts and approximation limits: `paulson-reference.md`, `silver-towers-reference.md`, `leslie-elab-reference.md`, `gould-plaza-reference.md`, `kimmel-reference.md`, `silver-center-reference.md`, `global-center-reference.md` and `courant-stern-detailing.md`. Some describe superseded models; preserve their provenance.

`streets-parks-data.md`, `streets-rendering.md`, `parks-rendering.md` and `park-vegetation.md` describe offline data, layering and planting bounds. `map-presentation.md`, `hover-reference.md`, `camera-navigation.md`, `union-square-context.md`, `map-performance.md`, `map-performance-research.md` and `loading-screen.md` explain presentation/input/loading contracts and evidence limits. `color-schemes.html` and `color-schemes.md` are design proposals and token notes.

[`../assets/avatars/`](../assets/avatars/) contains the 26 current generated low-poly profile PNGs with readable person names. The original scratch `output/` directory was deleted at the user’s request; these retained documentation images are not source photos. Map exports, derived geometry/data and reference text also live under [`../assets/`](../assets/info.md). Historical requests and recorded evidence retain their original asset paths.

[Cleanup handoff](cleanup-handoff.md) defines current folder ownership for parallel map/UI, agent and collector work.

[Initial MVP architecture](architecture.md) records the confirmed service direction, current deployed behavior, shared-tool intent and remaining implementation work.

`map-presence.md` documents the protected map read API, circular portrait overlay, temporary Bobst fixture commands, source-policy boundaries and debug/test handoff.

update-agent-prompt.md describes the actual runtime prompt/shared JSON contracts, the approved two-hour presence/event policies, safe interpretation/completion rules and remaining tool/deployment boundaries.

`events.md` describes the normalized events/event_buildings/event_people schema, multi-location visibility, source-authorized reads, optimistic RPC writes and staged legacy-column cutover. It supersedes older building-owned presence/event JSON descriptions once the rolling snapshot records hosted cutover.

miro-sync.md now documents live MCP access shared by both agents, application OAuth refresh, metadata-only registry policy and fixed Google Calendar reconciliation; the former snapshot worker is retired.

`bug-reports.md` describes the minimal hosted table, structured chat tool, write boundary and verification.

`long-term-memory.md` describes automatic shared club memory, injection, optimistic updates and schema/live verification.

`chat-agent-prompt.md` records calm chat, eboard/general/team routing, Calendar-first/Miro fallback and evidence-backed map tools. `update-agent-prompt.md` records the autonomous planner/update contract. Configured-model smoke evidence lives under evidence/agent-prompts; synthetic fixtures exercise behavior without writing club source events.

chat-agent-prompt.md includes user-directed fixed Calendar writes and the existing authorized Drive search/read behavior; autonomous planner provenance remains separate.

`deployment.md` describes verified current-Mac CLI access plus the private Railway website, isolated collectors/worker, environment-only gate and sole persistent Miro OAuth owner. Actual launch receipts remain in the milestone journal.

Miro quota recovery uses shared operational counters and cooldowns in existing service-only automation state, without storing board contents. See miro-sync.md for the UTC reset, protected chat budget and background cadence.

model-audit.md explains private planner/chat model-call and output accounting, null usage/cost limits, credential redaction, service-only access and seven-day retention.

The audit guide also explains per-attempt inference accounting. The automation
guide covers isolated queue retries, fair admission, temporary quarantine and
service-only recovery; the rolling milestone distinguishes local code from
applied schema and deployed behavior.

`discord-chat.md` documents shared assistant execution, verified caller context, eboard source/audience rules, private bridge setup and transient interaction limits.

[drive-skill.md](drive-skill.md) describes shared Tech@NYU Drive guidance, selective runtime activation, read-only folder navigation and private research boundaries.

`profile-avatars.md` documents private Supabase portrait storage, authenticated image delivery and the guarded operator upload/profile-cutover workflow. Actual rollout state remains in the milestone snapshot.

`tool-health.md` records the October21 live connector/model diagnosis, successful-empty progress correction, native Drive activation issue and explicit read-only/mutation verification limits.

`683-broadway-model.md` records Go Greek retirement, the guarded owner cleanup046 and historical import details. The popup modules/hooks are removed locally; the original background tower and shared map UI remain. Current live status is in the retirement milestone.

`discord-chat.md` also explains request-local attachment vision for verified trigger/reply/recent messages, bounded native-CDN downloads, partial coverage and existing permission/privacy boundaries.

`tool-failure-logging.md` records the fully paged historical failure baseline and safe versioned operational cause logging, including its retention, batch-detail and hosted activation limits.

`active-event-indicators.md` explains original marker provenance, active-window/whole-building glow integration and resource ownership. Its historical Go Greek sample is retired; generic coverage uses Silver Center.

Tool reliability guides distinguish historical failure diagnosis from current local implementation: five-minute broad Discord summaries, backend-owned bounded Calendar pagination and per-read map source-check reuse/concurrency. Planner relevant-link inspection is a saved requirement in notes.md; its implementation is a follow-up. Release and verification truth remain in milestones/milestone.md.

[attio-integration.md](attio-integration.md) documents the opt-in CRM route/tool contract, server configuration, write semantics and verification limits for website and Discord Flockbot.

`camera-navigation.md` describes the shared unobscured focus area and responsive activity-card positioning, complete-bound perspective fit and temporary lens widening within unchanged distance limits.

Discord access guides describe automatic blacklist-based catalogue grants for chat and the update agent. Non-Discord source grants remain explicit; queue claims use fresh eligible Discord IDs and the configured authorized Gmail source. See `discord-live-only.md` and `discord-chat.md`; actual release evidence remains in the milestone snapshot.

The [Discord conversation guide](discord-chat.md) documents explicit10total/5permember production configuration on web and discord-events, fallback3/1, supported ranges and overlapping history snapshots. Actual release verification remains in the milestone snapshot.

The [Discord conversation guide](discord-chat.md) documents `draft_discord_message`: request-local text for another eligible channel, displayed for review in the invoking reply with sent=false. It adds no sending, native draft persistence, source-read expansion or website/worker capability.

The [Google connector guide](google-connector.md) documents complete provider-confirmed Calendar write receipts, safe detail fields, missing/clear/truncation semantics and large-batch context limits. Receipt expansion preserves existing write/source/revision boundaries.

The chat-prompt and events guides distinguish direct chat-reported map saves from provider-backed autonomous updates. Direct chat asks for unclear identity/details and requires a successful receipt; it no longer asks for an original message merely to identify the speaker.


agent-automation.md and update-agent-prompt.md describe the staged two-calendar worker and temporary task context; events.md retains normalized data/source boundaries.

agent-automation.md documents the authenticated queued-only manual start/status API, exact per-run blacklist override, durable worker dispatch and existing lease/budget/visibility boundaries.

The automation, update-agent prompt and tool-failure guides explain safe tool-error replies and continued model work, while distinguishing actual run cancellation, invalid arguments and unchanged call limits.

The automation and update-agent prompt guides distinguish plain saved-task reads from agent-selected normal source/action tools and confirmed task completion checks.

Worker call-limit guidance records16calls per reply and64per stage, including finish_batch, while retaining shared chat defaults and existing time/round limits.

The chat, event and Discord guides now describe attendance through the ordinary map tools. Historical attendance-link validation is retained separately from tool exposure.

`flock-live-behavior-review-2026-10-22.md` records Chrome Discord behavior, actual Calendar/map checks, planner latency, user-corrected natural-message tests and exact cleanup status. Private raw source contents and credentials are excluded.

[October23 tool-isolation audit](tool-isolation-audit-2026-10-23.md) inventories every registered chat/planner tool and records11root/12candidate violations with source evidence; no runtime fix is claimed.

October23 isolated tools: [implementation contract](tool-isolation-implementation.md) and [verification/evidence limits](tool-isolation-verification-2026-10-23.md). Deployment truth is in milestones/milestone.md.

October23: isolated tools are accepted, integrated and deployed (web33f90fb7 / workerae88da62). Saved-map read verified1.595seconds; see rolling milestone and tool-isolation verification report for exact evidence/limits.

Chat map clock conversion and Spotlight queue verification are recorded in `chat-time-queue-verification-2026-10-23.md`; the rolling milestone holds release truth.

[Focused planner follow-up verification](planner-followup-verification-2026-10-23.md) records compact task reads, current-cycle selection, retained model failures and release limits.

chat-participant-normalization-verification-2026-10-23.md records label preservation, conservative duplicate removal, actual-model outcomes and release limits.

[Spotlight steering verification](spotlight-steering-verification-2026-10-23.md) records active-reply input, controls, independent browser/runner/model evidence, cancellation-only final delta and process-local limits.

planner-task-storage-verification-2026-10-23.md records catalogue/exact-read boundaries, synthetic/local PostgreSQL checks, hosted query-shape timing and actual release limits.

[Provider routing](provider-routing.md) documents the private ordered URL/key list, fallback boundaries, one shared deadline and per-attempt audit identity. Actual release status remains in the rolling milestone.

[contacts.md](contacts.md) describes the private six-field contact tools, version checks and model-testing boundary.

[style-design.md](style-design.md) records the current active UI colors, exact surface/shadow recipes, typography, layout, motion and Contacts extension rules, based on source and browser inspection.

The [Treg Contacts guide](treg-contacts.md) documents the direct authenticated import endpoint, private server configuration, conservative provider mappings, original-row retention, cost/idempotency behavior and simulated-versus-live verification.

The Contacts and style guides now describe the approved always-editable recessed fields, inline profile header, red square deletion confirmation and raised avatar/paging surfaces. The website release is verified live; hosted mutations remain distinct from synthetic CRUD evidence.

The [Gmail enrichment guide](gmail-enrichment.md) describes the separate sender-cache/Treg/Contacts worker, raw data preservation, ordered restart recovery, database leases/budgets, private logging and activation limits.

[Treg contacts](treg-contacts.md) describes the separate people-search and array-email-enrichment agent tools alongside the existing raw-preserving import API. Lookups do not save Contacts or touch sender cache.

The [dormant Treg lookup guide](treg-lookups.md) documents four prepared backend operations, their future route/input/result contracts, no-fallback cost/logging rules and intentional lack of running registration. It does not grant tool/UI/worker exposure or activation.

The Contacts guide describes the split field/footer layout, Flock it! handoff, names-only prompt chip and bounded per-message contact selector. The selector provides a saved-record subject without changing identity, source or write permissions.

update-agent-prompt.md describes independent presence routing, supported nearby departure context and same-task classification correction; production outcome and verification live in the milestone.

[Gmail sending](gmail-send.md) describes the separate website send API/tool, fixed account/OAuth opt-in, durable content-free receipts, conservative retry behavior and verification boundaries.

`treg-contacts.md` describes fixed Exa people search and native read projection. Existing dormant lookup routes remain separate; current release/test truth is in the milestone.

`ci-cd.md` defines enforced local/CI quality commands, file limits, review/push expectations and checked release packages with a separate production deployment step.

`tools-and-api.md` explains which services model tools and HTTP routes actually
call, where they share implementations and which operations have no counterpart.

`tools-and-api.md` explains the private operation boundary and links its runtime
verification, including independently accepted corrections and remaining
Calendar/Member Plans/planner behavior limitations.


`agent-tasks.md` is the user-editable catalogue of common Flock tasks and dated live workflow outcomes. Preserve manually added tasks and stable IDs; the milestone remains authoritative for implementation and release status.
