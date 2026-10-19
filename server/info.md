# Server source

The user-facing **chat agent** runs through the Hono Chat API. The autonomous **update agent** runs through `automation/`. Agent names do not change module paths or configuration keys.

`index.js` starts Hono, `config.js` reads server settings and `app.js` guards status, streaming chat, administrative and read-tool routes. `/healthz` identifies the API as `tech-nyu-api` for local paired startup. `providers/` supplies bounded model adapters/tool selection. Credentials stay server-side and never enter browser imports.

`assistant-context.js` orchestrates bounded read evidence, coverage and limitations for answers. `../tools/discord/` exposes Discord tools. `discord/` owns metadata discovery and live bot reads; larger summaries run only in request memory. There is no Discord content database or stored-summary fallback. Use `npm run discord:discover` for explicit metadata discovery; the redundant daily worker alias was removed. See [Discord source guide](discord/info.md).

`google/` owns Gmail/Drive OAuth reads and the independent Gmail event receiver. `automation/` owns authorized enqueue, metadata leases/receipts and the inactive LLM/tool handler. Native Gmail and Discord events have reached the pending queue. Collectors do not invoke models; see the [automation guide](../docs/agent-automation.md).

`miro/` owns the official live MCP transport/auth and metadata-only source registry. `../tools/miro/` shares scoped search/canvas/table reads across chat and update agents. No REST reader, snapshot collector or Miro writes remain.

Shared access uses trusted `ASSISTANT_ALLOWED_SOURCE_IDS` (`DEV_ALLOWED_SOURCE_IDS` alias), current source policies and backend administrator checks. No per-person membership tables remain. Production authentication is unfinished and protected routes remain closed by default. `time-zone.js` supplies strict timezone/calendar bounds with a shared request clock; legacy callers use UTC. This context does not grant source access.

The independent Railway collectors are running `discord-events` and `gmail-events`, sharing Supabase; `miro-sync` was deleted for live MCP access. No LLM service or Calendar/map write adapter is active. Startup never applies SQL. Current service evidence and remaining native edit/delete/blacklist verification live in the [milestone](../milestones/milestone.md).

`map/` supplies bounded avatar-name/Discord roster matching and service-only conditional identity imports. `scripts/map-roster.mjs` defaults to proposals; `--apply` writes only unique name matches and preserves manual/concurrent identity fields. The map tables are hosted. The protected /api/map/presence endpoint projects safe display fields for the frontend overlay; only exact local debug entries are enabled until current source-policy authorization is wired. Agent location-write tools remain separate; importing a person never claims their location or grants source access.

`assistant-context.js` reports actual registered tool execution start/result via
an optional request-local callback. `app.js` forwards bounded NDJSON tool records
before answer metadata/text: ID, name and running/completed/partial/failed only.
No arguments or result contents enter progress records. Existing four-call limit,
source authorization, adapter behavior and cancellation remain authoritative.

`bug-reports.js` saves user-reported product bugs through a fixed service-only RPC. Chat receives the dedicated bug_reports write tool; other retrieval tools retain their read-only behavior.

`memory.js` provides the bounded service store and shared-memory maintenance prompt. Chat loads one shared note before planning and injects it into planning/answers; successful model updates persist for later chats. Core instructions stay in code.

Miro calendar navigation now accepts valid omitted-array empty searches and locates exact month/year areas before reading canvas. Bounded chat retrieval and explicitly configured boards remain limits; no full-workspace completeness is claimed.

Chat prompting now includes calm tone and source routing; `assistant-context.js` supports8executedtools/8planningrounds for dependent Calendar/Miro/map workflows. `index.js` wires the same source-authorized map service into projection and request-local chat tools. Calendar originals need configured source identity; participation needs exact linked original author/sender evidence and successful lookup. Runtime UI tool progress matches the8callbound.

Chat binds the composite Google adapter per request so explicit current-user Calendar actions receive isolated intent/revision state. Calendar write receipts reach planning/answer context; stateless tool execution and Drive/Gmail retrieval do not gain mutation grants.

Chat has a separate overall requestTimeoutMs (ASSISTANT_REQUEST_TIMEOUT_MS, default300s/max600s) so paced source reads fit before final answer generation; provider LLM_TIMEOUT_MS remains an independent per-call limit.

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

Chat production fixes add once-per-message report orchestration and a narrow request-local named-person attendance adapter, composed with existing provider-backed map tools in runtime-app.js. Attendance retains source scope and current access under distinct app provenance, with optimistic preservation. chat-attachments.js is a browser-safe, I/O-free validation/conversion contract for bounded in-memory image/PDF/UTF8 text attachments; the API retains string message text as the only action-intent channel.

model-audit.js and audit-lifecycle.js add private model-return/output accounting and bounded seven-day cleanup for both chat and planner. Provider dispatch must durably start before production network requests. No prompts/source tool payloads or frontend log endpoint. See docs/model-audit.md.

Chat routing preserves Calendar-first unnamed-source schedules with Miro cross-check, then exact explicitly named-team Discord originals for unresolved details. Selected-channel summaries carry the returned channelId; failed reads/invalid calls never establish absence.

`SITE_ALLOWED_ORIGINS` adds explicit HTTPS login/mutation aliases while preserving the stable PUBLIC_ORIGIN used for saved attendance references. Cookies remain host-only; cross-site requests remain denied. Chat meeting routing preserves Calendar-first unnamed-source schedules and Miro fallback, then exact explicitly named-team originals for unresolved details. Selected-channel summaries carry the returned channelId; failed reads never establish absence.

Discord and website share `chat-runner.js`; `chat-request-context.js` validates trusted transport identity. `runtime-app.js` constructs a separate live-Discord-only runner for eboard replies, excluding website memory/private account tools. The web service exposes a separately authenticated internal Discord bridge. See `../docs/discord-chat.md`.

`chat-discord-context.js` validates the request-local previous-hour message envelope and the explicitly approved Discord ID/name directory; both are serialized as source/label data in both model phases.

Password website sessions default to30days and persist across browser restarts. site-auth.js sets matching signed expiry, Max-Age and Expires; logout clears the host-only Secure/HttpOnly/Strict cookie. SITE_SESSION_TTL_SECONDS supports300–2592000seconds; exact-lifetime validation means changing TTL invalidates older cookies.
