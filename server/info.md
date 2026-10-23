# Server source

The user-facing **chat agent** runs through the Hono Chat API. The autonomous **update agent** runs through `automation/`. Agent names do not change module paths or configuration keys.

`index.js` starts Hono, `config.js` reads server settings and `app.js` guards status, streaming chat, administrative and read-tool routes. `/healthz` identifies the API as `tech-nyu-api` for local paired startup. `providers/` supplies bounded model adapters/tool selection. Credentials stay server-side and never enter browser imports.

`assistant-context.js` orchestrates bounded read evidence, coverage and limitations for answers. `../tools/discord/` exposes Discord tools. `discord/` owns metadata discovery and live bot reads; larger summaries run only in request memory. There is no Discord content database or stored-summary fallback. Use `npm run discord:discover` for explicit metadata discovery; the redundant daily worker alias was removed. See [Discord source guide](discord/info.md).

`google/` owns Gmail/Drive OAuth reads and the independent Gmail event receiver. `automation/` owns authorized enqueue, metadata leases/receipts and the bounded LLM/tool handler. Native Gmail and Discord events have reached the pending queue. Collectors do not invoke models; see the [automation guide](../docs/agent-automation.md).

`miro/` owns the official live MCP transport/auth and metadata-only source registry. `../tools/miro/` shares scoped search/canvas/table reads across chat and update agents. No REST reader, snapshot collector or Miro writes remain.

Non-Discord access uses trusted `ASSISTANT_ALLOWED_SOURCE_IDS` (`DEV_ALLOWED_SOURCE_IDS` alias), current source policies and backend administrator checks. Authenticated website/chat requests and update-agent claims derive Discord source grants from the current published guild catalogue, preserving blacklist, manual-disable, audience and live permission checks. No per-person membership tables remain. Production authentication is unfinished and protected routes remain closed by default. `time-zone.js` supplies strict timezone/calendar bounds with a shared request clock; legacy callers use UTC. This context does not grant source access.

The independent Railway collectors are running `discord-events` and `gmail-events`, sharing Supabase; `miro-sync` was deleted for live MCP access. Worker activation and Calendar/map adapter availability are controlled by private Railway settings and current source grants; the milestone separates live and held releases. Startup never applies SQL. Current service evidence and remaining native edit/delete/blacklist verification live in the [milestone](../milestones/milestone.md).

`map/` supplies bounded avatar-name/Discord roster matching and service-only conditional identity imports. `scripts/map-roster.mjs` defaults to proposals; `--apply` writes only unique name matches and preserves manual/concurrent identity fields. The map tables are hosted. The protected /api/map/presence endpoint projects safe display fields for the frontend overlay; only exact local debug entries are enabled until current source-policy authorization is wired. Agent location-write tools remain separate; importing a person never claims their location or grants source access.

`assistant-context.js` reports actual registered tool execution start/result via
an optional request-local callback. `app.js` forwards bounded NDJSON tool records
before answer metadata/text: ID, name and running/completed/partial/failed only.
Successful `empty` results show completed progress; model results and private
audit outcomes retain `empty`, while actual errors still show failed progress.
No arguments or result contents enter progress records. Existing four-call limit,
source authorization, adapter behavior and cancellation remain authoritative.

`bug-reports.js` saves user-reported product bugs through a fixed service-only RPC. Chat receives the dedicated bug_reports write tool; other retrieval tools retain their read-only behavior.

`memory.js` provides the bounded service store and shared-memory maintenance prompt. Chat loads one shared note before planning and injects it into planning/answers; successful model updates persist for later chats. Core instructions stay in code.

Miro calendar navigation now accepts valid omitted-array empty searches and locates exact month/year areas before reading canvas. Bounded chat retrieval and explicitly configured boards remain limits; no full-workspace completeness is claimed.

First Drive proposals load the shared Drive skill and replan the entire proposed
turn before committing native messages, IDs or effects. Previously executed
receipts remain in context; discarded proposals produce no synthetic tool result,
progress or execution audit. Their uncommitted IDs may be proposed again.

Chat prompting now includes calm tone and source routing; `assistant-context.js` supports 30 executed tools / 30 planning rounds for dependent Calendar/Miro/map workflows. `index.js` wires the same source-authorized map service into projection and request-local chat tools. Calendar originals need configured source identity; participation needs exact linked original author/sender evidence and successful lookup. Runtime UI tool progress matches the 30-call bound.

Chat binds the composite Google adapter per request with the same Calendar read/write definitions for all user wording. The model resolves requested actions and confirmations from conversation; it must ignore quoted or retrieved instructions and clarify ambiguous targets. Actual execution checks trusted Google access, fixed targeting, valid arguments and request-local revision/idempotency state. Stateless mutations remain denied. Calendar receipts reach planning/answer context. Orchestration does not infer Calendar intent or stop workflows through wording heuristics; model completion, 30-round/30-call limits and duplicate-call guards bound execution. No adaptive two-round shortcut truncates source-to-Calendar workflows. Mechanical stall detection permits two duplicate-only rounds with feedback and stops on a third consecutive round executing no new call; any new call resets that counter. This never interprets user intent or changes tool visibility.

Chat has a separate overall requestTimeoutMs (ASSISTANT_REQUEST_TIMEOUT_MS, default420s/max600s) so a broad Discord summary's shared300second scan can leave time for planning and final answer generation. Explicit shorter overrides and parent cancellation remain authoritative; provider LLM_TIMEOUT_MS stays independently30seconds by default.

Production entrypoint `web.js` wraps the shared `runtime-app.js` factory with `site-auth.js` signed sessions, fixed-origin writes and protected static assets/API. Local `index.js` retains development authentication. Internal Miro token broker uses an independent server credential.

`SITE_ALLOWED_ORIGINS` adds explicit HTTPS login/mutation aliases to `PUBLIC_ORIGIN`.
Only exact configured origins pass; cross-site requests remain denied. This lets a
custom domain sign in without changing existing chat-attendance provenance or
worker configuration. Cookies remain host-only and private.

The web login template is a white terminal-style screen with a muted teal tilde,
dark gray#62645f block cursor and muted#a19d93 enter password placeholder. Current local weekday,
date and time appear above using an inline Intl clock. Group is centered at46%
horizontally, with20px between clock/prompt and normal monospace tracking.
Prompt uses.55em tilde/cursor and.45em cursor/placeholder gaps. Native placeholder
state hides copy on typing; a length-only mask
renders asterisks with textContent, clips long entries and places the cursor after
them. Input/change/pageshow refresh the mask without plaintext echo, persistence
or extra requests. Clearing restores placeholder. Cursor blinks instantly over
1.1s; reduced motion keeps it steady. Accessible native password input and Enter
POST remain. Fixed-origin checks, login limits and session issuance stay unchanged
in web.js/site-auth.js. The terminal UI/favicons are published; latest release receipts live under
evidence/password-ui and the milestone journal.

Login declares root SVG/ICO favicons. Only exact GET/HEAD /favicon.svg and
/favicon.ico are public branding exceptions; existing static validation rejects
symlinks and malformed paths. All other assets/API access still requires login.

Password Enter explicitly calls native form.requestSubmit with default prevented
and IME-composition ignored. Native required validation and existing POST auth
remain. Successful login redirects straight to / and its animated @ startup
screen; automatic map reveal remains in the existing startup modules.

Chat production exposes only the normal read_map_events, lookup_map_person and upsert_map_event map tools. Existing-event attendance uses that same read/lookup/merged-write flow; verified Discord speakers and supplied unambiguous names resolve identity, and unclear details use conversational clarification. The separate attendance parser/resolver/write service is retired; historical attendance-link source checks remain. Applied normal map receipts alone confirm saving. Once-per-message bug report orchestration is unchanged. chat-attachments.js is a browser-safe, I/O-free validation/conversion contract for bounded in-memory image/PDF/UTF8 text attachments; the API retains string message text as the only action-intent channel.

model-audit.js and audit-lifecycle.js add private model-return/output accounting and bounded seven-day cleanup for both chat and planner. Provider dispatch must durably start before production network requests. No prompts/source tool payloads or frontend log endpoint. See docs/model-audit.md.

Chat routing preserves Calendar-first unnamed-source schedules with Miro cross-check, then exact explicitly named-team Discord originals for unresolved details. Selected-channel summaries carry the returned channelId; failed reads/invalid calls never establish absence.

Discord and website share `chat-runner.js`; `chat-request-context.js` validates trusted transport identity. `runtime-app.js` supplies the full website adapter set to the same runner for Discord, preserving request-local action/evidence gates. Shared source grants and a required nested Discord audience subset remain separate. The web service exposes a separately authenticated internal Discord bridge. See `../docs/discord-chat.md`.

`chat-discord-context.js` validates the request-local previous-hour message envelope and the explicitly approved Discord ID/name directory; both are serialized as source/label data in both model phases.

Password website sessions default to30days and persist across browser restarts. site-auth.js sets matching signed expiry, Max-Age and Expires; logout clears the host-only Secure/HttpOnly/Strict cookie. SITE_SESSION_TTL_SECONDS supports300–2592000seconds; exact-lifetime validation means changing TTL invalidates older cookies.

`skills/` contains shared server-owned domain guidance. Chat and the autonomous planner selectively load the same Tech@NYU Drive skill before Drive execution; the runtime Google account remains separate from desktop MCP connections and private research files.

Calendar planning includes observed mutation attempts and validated receipts only after a write attempt. This execution-progress record grants no authority and does not infer remaining user actions. The model must finish every requested action, including creation after a requested cancellation, without repeating successful mutations.

Chat planning uses native provider tool turns when available: assistant call IDs have matched transient tool results, including nonexecuting invalid, unknown, duplicate, budget and Drive-skill skips. The original user conversation alone reaches action/evidence gates. 30 calls / 30 rounds, three consecutive no-new-call stalls and bounded native context remain enforced. Injected legacy providers retain planTools; image/PDF attachment conversations retain the existing multimodal planTools path. Native planning omits duplicate full result JSON from the system prompt. Both model stages receive server-owned registered-tool/Google-grant and actual Calendar outcome summaries so old assistant refusals cannot invent current capability restrictions.

The final answer prompt explicitly ends the tool-execution phase and reports supplied receipts as completed outcomes with exact links. It must not replace a saved outcome with future-tense checking or promises. Both phases focus on the latest turn: retries may continue a pending action, while unrelated historical tasks and complaints do not create new bug reports.

Chat all-day copies use create_calendar_events for up to50rows per model call. Per-row canonical receipts and complete/partial counts survive planning/answer projection and native evidence-budget reduction; operational audit adds scalar counts only. driveContent preserves up to12000characters of exported original text separately from1800-character citations, with explicit truncation/first-sheet scope. Prompts carry source/title/date/skip rules through corrections, complete clear rows without renewed approval, and isolate unresolved rows. Cancellation/timeout still ends the runner promptly and cannot guarantee a partial final reply; duplicate-safe retries reconcile previously saved rows.

`chat-behavior.js` supplies shared task-completion and relevant-citation guidance to website and Discord planning/reporting. It preserves user constraints, directs corrections on existing records and avoids treating a read, report or apology as a completed action; backend grants and revisions still decide execution.

Trusted Discord pings can include separately validated repliedMessage evidence alongside the previous-hour context. The bridge passes only the approved actor to the web-side loader, which fetches the exact trigger and direct reply target with existing source checks. Both model phases receive the whole bounded text as untrusted facts and retain the actual speaker; no-source messaging recognizes usable reply text even when the recent-hour list is empty. This does not grant map identity authority or expose raw reply bodies in client metadata/audits.

Source adapters share the 60-second default in `source-timeout.js`, including map/source verification, Google, Discord, Miro, shared memory and bug-report persistence. Caller cancellation and explicit shorter overrides still apply; longer conversation, scan and pacing budgets retain their existing limits.

Private map portraits are served by `map/avatars.js` through the authenticated
`GET /api/map/people/:personId/avatar` route. Runtime wiring creates the bounded
server-only Storage reader. Profile HTTPS references become person-bound
same-origin paths; private bucket URLs/credentials never appear in display data.
Legacy safe local avatars remain compatible during storage migration. The route
uses existing site/development authentication and private no-store PNG responses;
see [map guide](map/info.md) for request, binary and resource bounds.

`tool-diagnostics.js` defines append-only version-1 operational code dictionaries and sanitizers. Chat/worker diagnostics log fixed causes and reviewed schema field IDs without source content or argument values; model-audit stores numeric codes in existing private counts and mirrors safe labels to Railway. Calendar saved locations remain business receipt fields and never enter diagnostic events.

`attio/` supplies the opt-in live CRM client. `runtime-app.js` registers its shared adapter for website and Discord chat; `app.js` exposes it through existing authenticated `/api/tools/:tool` routes. `chat-runner.js` and `assistant-context.js` carry bounded CRM context and write receipts through both planning protocols. Attio has separate source/object authorization and does not supply map write evidence or autonomous-worker access. See [Attio setup](../docs/attio-integration.md).

The trusted Discord bridge separately injects `discordDraftTools` into its shared runner. Request-local `draft_discord_message` results preserve bounded target/text/sent=false through planning and answering, without operational/NDJSON body leakage or target source-grant expansion. Website, stateless tools and worker receive no draft adapter; Discord delivery remains a reply in the invoking channel.

Calendar writes now share a bounded saved-event receipt projector under google/calendar-receipt.js. Planning/native/duplicate/final contexts preserve actual saved details and explicit omission metadata; large batches compact deterministically. No new Calendar mutation authority, map behavior, operational-body logging or schema is introduced.


The update worker now supports an explicitly enabled initial-agent/API/follow-up lifecycle and temporary source-scoped pending tasks. The web map authorizer recognizes the separately pinned Member Plans target; this changes data source authorization, not geometry or renderer.

Authenticated chat uses the existing map read/person-lookup/upsert tools. `tools/map/chat.js` removes original-message, linked-author and lexical report checks, supports verified Discord actor or named roster lookup, and fills omitted provenance. The normal conversation carries clarification; no extra tools, report parser, session identifier or pending cache exists. `assistant-context.js` retains Discord-to-person context in system prompts and projects it into map-tool results. Worker authorization stays independent.

POST /api/planner/runs and GET /api/planner/runs/:runId require their own server-only PLANNER_API_KEY bearer header. Only these routes bypass the website cookie gate; app.js checks the key directly with automation/manual-auth.js. Cookies and admin sessions cannot substitute for the key. These routes only store/read bounded metadata; the separate existing worker performs forced queued-input cycles under the global lease.

The October 22 prompt audit removes keyword-generated map write reminders, scopes Miro evidence/date-shorthand instructions correctly and supplies applied map submission details to final answers. Conflict recovery permits one repeated relevant read after an observed optimistic conflict; mutation deduplication and existing budgets remain. See ../docs/prompt-audit.md for coverage and actual release status.

Chat map timing now accepts new/changed local clocks through starts_local and
ends_local. `map/chat-time.js` converts in event.time_zone and rejects UTC
retagging, dual boundary forms and invalid/ambiguous daylight-saving clocks
before a map write. Raw boundaries are exact same-event/person preservation
copies from the current request only. Existing source timestamps remain separate.
Read and applied-receipt projections retain derived local dates, offsets and
12-hour labels, including participant inheritance, within existing completeness
bounds. Display hints are omitted from storage. The shared map/worker schema is
unchanged; normal Calendar writes retain their existing timestamp contract.
The model-facing read projection omits optional null time fields while the raw
read/private snapshot remains exact. Prompt guidance requires clarification before
any map mutation when multiple current records match without a unique user detail
or event ID, including corrections.
The same target-choice instruction appears at the end of planning and in chat
map read/upsert descriptions. Filtered reads retain earlier matching candidates;
choosing an ID for inspection does not grant permission to choose that target.
Multiple candidates for one request are not independent clear actions.

Chat suppresses repeated calls using sorted object keys while preserving array
order and original dispatched arguments. Valid personName lookups additionally
share the map adapter's NFC/trim/space/case normalization; malformed arguments
retain their original signature and normal adapter validation feedback. Provider
IDs, URLs and other argument values are not normalized. This memo is confined to
one request and does not change grants, call budgets or backend validation.

Map write failures retain a safe mapFailure with the attempted event ID, fixed
semantic/schema field hints and visible submitted row positions. Unavailable or
missing receipts remain unconfirmed, while known rejections remain unsaved.
Prompt guidance reuses prior successful identities and complete snapshots; only
an actually missing requested change needs a repair. Conflicts use the existing
targeted refresh allowance. There is no forced retry or cross-service recovery.

A rejected duplicate proposal may carry a readComparison showing that its unique
rows and event fields exactly match the same authorized request-local read. The
helper uses exact stored timestamp/URL strings and the parent read revision.
The adapter suppresses the hint after any unsuccessful later map read, changed
scope or different snapshot. This adds only failure context: the model still
compares the user's requirements, and no write is skipped, repaired or authorized.

Map prompting gives target selection priority over state comparison and failure
recovery. Only an unambiguous user target proceeds to those later decisions.
The final planning decision repeats that target check after recovery guidance;
the upsert description uses a short selection requirement rather than duplicating
the recovery paragraph. Time conversion and failure/comparison code are unchanged.
The target rule explicitly ends tool selection with zero calls when an ambiguous
map change is the only remaining action. A small two-room example distinguishes
that empty selection from the separate answer stage's clarification question.
This changes model instructions only; no backend target selector or stop rule is
introduced, and unrelated separately requested clear work may still proceed.

Contextual attendance guidance in chat-behavior.js and assistant-context.js makes existing event hours precede missing-time questions or separate activity creation; short timing clarifications inherit the matched event interval.

`tool-diagnostics.js` keeps fixed, bounded failure codes without raw proposed values or credentials. The local worker candidate adds only `participation_task_not_ready` to distinguish task preparation from source denial; no permission, execution or completion check changes.
