# Independent tester report — live Discord and Google runtime

- Milestone / role / scope: M25/M26; independent tester; live-first orchestration,
  read-only bot tools, prepared Google OAuth runtime and HTTP API integration.
- Starting state and files inspected: `AGENTS.md`, current milestone/to-do and
  latest Miro research history, workflow/assignment/report templates, tester role,
  Git state, live Discord modules, Google modules/CLI, app/config/index and
  assistant context. Prior M23/M24 changes and other specialists' files preserved.
- Work performed and changed files: added `tests/discord-live-tools.test.mjs`,
  `tests/google-connector.test.mjs`, `tests/assistant-context.test.mjs`,
  `tests/assistant-connectors-api.test.mjs` and this evidence folder. No application,
  shared journal, package or cloud modifications by this tester.
- Decisions and assumptions: tests inject fixture fetch/OAuth/provider adapters;
  explicit local operator grants are server-owned. Production member auth remains
  denied. Archive retrieval/persistence spies throw to catch accidental use.
- Checks: initial module run found three orchestration failures: stale fallback
  eligibility after a complete read; dropped truncation warnings; swallowed
  fallback cancellation. Root corrected all three; subsequent 38/38 new module
  checks passed. Google external ID/content notices and catalogue truncation were
  also verified after root corrections.
- Integrated command executed: `node --test tests/assistant-connectors-api.test.mjs
  tests/assistant-context.test.mjs tests/discord-live-tools.test.mjs
  tests/google-connector.test.mjs tests/assistant.test.mjs
  tests/backend-provider.test.mjs tests/knowledge.test.mjs` — exit 0, 78 passed,
  zero failures/skips at that checkpoint.
- Additional checks cover inherited private-thread exclusions, globally combined
  text budgeting, and permanently indexing Discord search. The final error-body
  regression initially failed: HTTP 403 with a non-JSON body was classified as
  `invalid_response` instead of `permission_denied`; coder/root notified because
  this could authorize inappropriate fallback. Final retest recorded below.
- Broadened legacy regression command: `node --test tests/discord-api.test.mjs
  tests/discord-client.test.mjs tests/discord-store.test.mjs` — exit 1, 16 passed,
  6 failed. Five API cases and one store/API integration still assume the retired
  archive-search adapter path, now returning 503 or making no archive call. Root
  notified to replace/retire those expectations explicitly; files left unchanged
  because this tester was not assigned ownership. Client and standalone store
  permission checks passed. This is an intentional-contract reconciliation gap,
  not a reason to restore archive-default chat retrieval.
- `npm run build:api` — exit 0, syntax/runtime dependencies verified.
- Meaningful covered behaviors: explicit connector opt-in, default/production
  denial and spoofed transport headers; fresh guild/channel/category policy,
  unknown ancestry and revision races; exact half-open time windows, snowflake
  pagination, duplicate cursors, page/message/text limits and cancellation;
  nested search-hit filtering and 202/429 retries; source links; no archive reads
  or writes; OAuth expected-account/scopes/revocation checks; read-only Gmail
  metadata/text and excluded attachments; inert HTML; escaped Drive queries;
  metadata-only binary reads and first-sheet-only Sheets warnings; missing config;
  second-round source-ID lookup, unavailable-only disclosed summary fallback,
  no fallback after denial/successful empty reads, partial-evidence and context
  budgets; real Hono streaming with fixture providers and ACL-scoped summary-store
  filtering independent of returned RPC rows.
- Unavailable/deferred: authenticated Google consent/token exchange and loopback
  callback behavior were not run; callback state/PKCE/expiry/output protections
  were source-inspected. No live Discord/model/Google requests, Supabase schema
  execution, Railway deployment, scheduler observation or raw-message deletion.
  Summary generation/vector persistence and migration execution belong to the
  separately assigned summary tester. No browser/map tests needed for this pass.
- Folder-guide updates needed: root should list the four tests in `tests/info.md`
  and this evidence folder in `evidence/info.md` when integrating.
- Handoff: root must journal the pass and resolve/retest the HTTP 403 finding
  before accepting final local connector behavior.

## Final connector integration retest

Root fixed HTTP error classification before parsing a response body. The tester
then verified non-JSON 403 is `permission_denied`, repeated 202 is bounded to four
attempts, and no upstream body enters returned errors. On explicit root assignment,
updated `tests/discord-api.test.mjs` and `tests/discord-store.test.mjs` to replace
the retired archive API assumptions with injected live tools. Preserved source
scope, filter validation, context budgets, production denial and standalone store
permission checks. Added explicit proof an archive store alone cannot expose raw
message search. Semantic live search is rejected with 400 without embedding or
archive calls. User messages remain intact while live queries are capped at 500
characters. Author filters use the supported Discord author ID.

Executed:

```sh
node --test tests/assistant-connectors-api.test.mjs tests/assistant-context.test.mjs tests/discord-live-tools.test.mjs tests/google-connector.test.mjs tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs tests/discord-api.test.mjs tests/discord-client.test.mjs tests/discord-store.test.mjs
```

Exit 0; **103 passed**, zero failed/skipped/cancelled. This includes 47 new
connector/context/API checks and 56 existing checks. The legacy six failures and
HTTP denial finding are resolved. Local connector acceptance: **PASS**, subject to
the live/auth/deployment limitations above. Direct chat summary helper testing is
pending root's integration interface at this checkpoint; completed below.

## Direct live chat summary helper pass

Root assigned exclusive `tests/discord-live-chat-summary.test.mjs`; added 13
fixture checks. Verified small/empty windows return originals without model calls;
large windows feed all originals (including text beyond displayed excerpts) through
RAM-only map/reduce; returned links and date ranges retain live provenance;
partial/denied fetches stop before model work; invalid arguments stop before
fetching; foreign citations fail closed; model failure returns partial evidence;
cancellation propagates; completed live summaries never query stored fallback.
The injected provider exercises actual reservation/usage hooks. Verified a single
tool execution stops after 12 dispatched model calls or $0.10 reserved cost.

Budget scope caveat sent to root: at this checkpoint these limits initialize inside
each `execute(read_discord_window)` call. Four distinct window calls in one HTTP
chat request could each receive a separate budget (up to 48 calls / $0.40).
This must be described as per-tool or changed to shared request scope before a
per-request 12/$0.10 claim is accepted.

Executed:

```sh
node --test tests/assistant-connectors-api.test.mjs tests/assistant-context.test.mjs tests/discord-live-tools.test.mjs tests/discord-live-chat-summary.test.mjs tests/google-connector.test.mjs tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs tests/discord-api.test.mjs tests/discord-client.test.mjs tests/discord-store.test.mjs
```

Exit 0; **116 passed**, zero failed/skipped/cancelled. No live model/account or
cloud calls. Map/reduce summaries in these tests are deterministic fixtures;
semantic summary quality against real Discord remains unverified. Local helper
behavior passes with the budget-scope caveat above.

## Review-fix retest — accepted local state

Root corrected the shared request budget: the same AbortSignal now shares both
12-dispatch and $0.10 reservation limits across distinct tool windows, while a new
request gets a fresh budget. Independent fixtures verify both caps and period-
specific summary IDs. **The earlier budget-scope caveat is resolved.**

Additional checks exercise short Discord pages continuing until a true empty page;
MESSAGE_CONTENT intent flags 18/19 with missing capability denying before message
reads; validated Discord URL guild/channel/message scope surviving normalization;
invalid requests never authorizing fallback; unread nontext counts and content
scope through model context; retained Google sender/recipient/date; shared Drive
flags. Added `tests/summary-fallback.test.mjs` with six checks for original per-
finding citations, rejected malicious/cross-channel URLs, original weekly periods
distinct from requested dates, exact requested search scope, trusted source grants,
foreign-guild/unresolved-link rejection before model/database calls, and abort.

Final command:

```sh
node --test tests/assistant-connectors-api.test.mjs tests/assistant-context.test.mjs tests/discord-live-tools.test.mjs tests/discord-live-chat-summary.test.mjs tests/google-connector.test.mjs tests/summary-fallback.test.mjs tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs tests/discord-api.test.mjs tests/discord-client.test.mjs tests/discord-store.test.mjs
```

Exit 0; **130 passed**, zero failures/skips/cancellations. Final local verdict:
**PASS**, no outstanding connector findings. Live account/model/deployment/schema
and scheduler limitations remain as recorded above. Root owns shared journal and
folder-guide integration. Tester changed no application implementation.

## Fresh ancestry follow-up

- Scope / role: independent tester, narrowly assigned ancestry-guard regressions.
- Files: only `tests/discord-live-tools.test.mjs` and this report changed. Added
  fixture injection for fresh channel metadata and two tests with 14 malformed
  cases: omitted parent_id, undefined, empty string, invalid string, number,
  boolean, object, on both ordinary channels and freshly retrieved thread parents.
  Stale discovery metadata remains valid and an inherited category is excluded,
  so these specifically prove malformed fresh metadata cannot erase exclusions.
- Checks: every malformed fresh result returns `channel_scope_denied`, zero
  message API calls and no sources. Explicit null and valid snowflake controls
  succeed for both ordinary channels and thread parents. Focused command
  `node --test tests/discord-live-tools.test.mjs` — exit 0, 19/19 pass.
- Full check: reran the 12-suite final command printed above — exit 0,
  **132/132 pass**, zero failures/skips/cancellations.
- Findings / limitations: no new failures; local fixtures only, no external calls.
  Previously recorded live account/model/cloud limitations remain.
- Verdict / handoff: **PASS**. Root owns journaling acceptance; no implementation,
  shared guides, journal or other specialists' files edited in this follow-up.

## Provider function-tool compatibility follow-up

- Milestone / role / scope: M25 independent tester; root's narrowly scoped
  planning compatibility adjustment after a separately observed live HTTP 400.
- Input / changed files: inspected `server/providers/index.js` and existing
  provider fixtures; added only assigned `tests/provider-tool-compatibility.test.mjs`
  and this evidence entry. Root owns implementation and journal changes.
- Checks and decisions: six tests exercise official OpenAI `gpt-6-luna` and
  `gpt-6-sol` planning, with and without trailing slash, requiring
  `reasoning_effort: none`; verify usable parsed tool calls, unchanged schemas,
  conversation, explicit `store:false`, non-streaming planning and request path.
  Other model names, proxy URLs, deceptive domain suffixes, alternate API paths
  and Anthropic retain their prior request shapes without the override. Planning
  followed by answer streaming on the same provider instance proves no automatic
  reasoning override or function tools leak into answer streaming. A fixture 400
  remains sanitized without upstream private details.
- Exact command:

```sh
node --test tests/provider-tool-compatibility.test.mjs tests/backend-provider.test.mjs tests/assistant-connectors-api.test.mjs tests/assistant-context.test.mjs tests/discord-live-tools.test.mjs tests/discord-live-chat-summary.test.mjs tests/google-connector.test.mjs tests/summary-fallback.test.mjs
```

- Result: exit 0; **95/95 pass**, zero failures/skips/cancellations. This targeted
  run includes the six new compatibility cases, existing backend provider cases
  and all connector/helper/fallback suites. It is a different selection from the
  earlier 132-test integration command; no SQL suites rerun for this provider-only
  change. Scoped `git diff --check` passes.
- Limitations: all provider traffic was injected local fixtures. This tester did
  not reproduce the actual hosted 400 or execute paid model, account or cloud
  calls. Existing deployment/Google consent/live-quality limits remain.
- Verdict / handoff: **PASS** for the compatibility adjustment. Root should
  journal this pass and independently verify its intended live request when
  authorized; no remaining test findings in this scope.
