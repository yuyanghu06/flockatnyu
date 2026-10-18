# Independent events relationship acceptance

## Follow-up: fixed five event types and icon-free cards

- Date: **2026-10-18, America/New_York**. This is the current final independent
  test receipt. Earlier12/14check and pending hosted027statements below describe
  previous passes only; hosted integration is recorded separately by the root.
- Milestone / role / scope: independent final testing of migration028, exact
  `study`, `meeting`, `event`, `social`, `other` taxonomy, trusted type metadata,
  weekday/bold time and room-only metadata, and readable mobile participant rows.
  The user cancelled category logos during testing; final acceptance requires no
  category images or asset requests. Existing people/brand/building portraits are
  outside that cancellation and remain present.
- Starting state and coordination: read current milestone/to-do and actual
  migration/runtime/frontend source; waited for the runtime and then root's final
  frontend handoffs. Earlier icon-bearing17/17run was superseded by the user's
  cancellation. Its category-image screenshot was removed; current screenshots
  use the final icon-free layout. No historical journal entries were edited.
- Work / allowed edits: updated only owned `tests/events-browser.mjs`, this report,
  the evidence guide, JSON and synthetic screenshots. Applies real001–028SQL in
  PGlite, uses actual store/service/source-authorizer/Hono/Vite/frontend, plus
  explicitly injected browser responses for five-row mobile and malformed unused
  type metadata. No implementation/shared journal/cloud/model changes or children.
- Executed command results: `npm run test:map-events` **76/76**, exit0;
  `npm run test:update-agent-prompt` **25/25**, exit0;
  `npm run test:agent-automation` **141/141**, exit0. The broader automation suite
  was run once because strict type catalogue/event fixtures changed across shared
  services and adapters. Logs: `/tmp/events-types-map-events.log`,
  `/tmp/events-types-prompt.log`, `/tmp/events-types-automation.log`.
- Final actual browser checks: `node tests/events-browser.mjs` **17/17**, exit0.
  Exactly five fixed catalogue rows remain available through a trusted read even
  when event filters match nothing; each category's API event uses safe
  `{code,name,iconKey}` metadata. There are zero category image elements, category
  asset requests or external requests, including for missing/unknown/malicious
  unused metadata. All five synthetic category records retain participant
  portraits. Bobst's repeated building prefix is stripped to `Test common area`
  on its own line; timed dates include weekday and font weight650. Mobile rows use
  one full-width details column (at least100px), with portraits below. All original
  all-kind, caption, permission, overlap, future-return,201event and Tokyo all-day
  checks remain passing. Browser/page/console/request errors are zero.
- Finding and resolution: screenshot inspection found the fixed assistant launcher
  covering the last mobile attendee portrait on a long card. Root reserved bottom
  space through mobile card height/offset. Added regression scrolls the card to its
  true bottom and checks `elementFromPoint` at the final portrait center; it must
  resolve inside that portrait. This now passes; no covered-portrait acceptance is
  claimed. Root owns the CSS fix; tester did not edit implementation.
- Evidence / limits: `browser-report.json`, refreshed normal screenshots,
  `mobile-types-top-synthetic.png`, `mobile-types-bottom-synthetic.png` and
  `untrusted-types-synthetic.png`. All names/event facts are synthetic; existing
  approved portraits are local. Desktop/mobile screenshots visually inspected.
  Syntax and owned diff checks pass. Own browser/database/services closed. Hosted
  migration, real source/model, production member auth/deployment, physical device
  and GPU/FPS verification remain outside this independent local pass.
- Acceptance / handoff: **PASS**, no remaining tester blocker. Root journals this
  pass and owns the normal-preview/live verification and final integration. Earlier
  report sections below are historical results, not current command counts.

## Follow-up: all event kinds in building cards

- Milestone / role / scope: independently verify the user's correction that a
  building's Scheduled card includes authorized current/future presence records
  and personal plans as well as scheduled events. Read current milestone/to-do,
  runtime source and updated assignment. Waited for coder's finalized handoff.
- Allowed work / actual changes: updated only owned `tests/events-browser.mjs`
  and this evidence folder. Added Stern/Kimmel synthetic screenshots and refreshed
  prior snapshots/JSON/guide. No implementation/shared journal/schema/data edits,
  cloud calls, child agents or model requests.
- Checks: `node --test tests/map-presence.test.mjs
  tests/map-source-access.test.mjs` passed **25/25**, exit0, no skips; log
  `/tmp/events-all-kinds-focused.log`. `node tests/events-browser.mjs` passed
  **14/14**, exit0. `node --check tests/events-browser.mjs` and owned diff check
  passed. Full automation suite was not rerun for this bounded presentation change;
  earlier138/138receipt below is historical.
- New independent SQL-to-real-browser assertions: current Bobst presence and
  future Bobst personal plans appear in its card; Stern's single all-day personal
  plan appears with two portraits and blank activity captions; Kimmel's future
  personal plan has an event card and portraits while producing zero premature map
  avatars. Scheduled rows with no participants remain visible. Private plans with
  only denied/declined/ended participation, orphan presence, expired plans and
  superseded records are absent; source-denied event and participant names do not
  leak. Latest blank participation still cannot mask the newest nonblank activity
  caption. Prior multi-building/dedup/same-building return/mobile201event/Tokyo
  timezone/source-revocation checks remain passing.
- Evidence: final `browser-report.json` records14checks, no page/console/request
  errors,33real store RPC calls and873current-source checks. Additional
  `stern-plan-synthetic.png` and `kimmel-future-plan-synthetic.png` use only
  synthetic names/events and approved local portraits. Stern/Kimmel screenshots
  were visually inspected. Own ephemeral services/browser/database were closed.
- Verdict: **PASS**. No remaining tester blocker. Root owns the live API/browser
  restart, independent evaluator acceptance and serialized journal integration.
  Limits remain synthetic storage/source/auth injection, headless Chrome viewport
  emulation, no hosted data/model/deployment claim and no physical GPU/touch/FPS
  measurement. Existing geometry bounds/camera transition checks still pass.

## Initial normalized-table cutover acceptance

- Milestone / role / scope: normalized events cutover; independent tester. Verify
  SQL-to-runtime-to-map behavior, visibility relationships, schedules, attendee
  portraits and access boundaries. No implementation or shared journal edits.
- Starting state and files inspected: AGENTS.md, notes.md, current milestone and
  to-do, latest linked UI history, agent-workflow and assignment/report templates,
  tester role instructions, migrations026/027, event/presence/source services,
  Hono/Vite wiring, current frontend and existing SQL/service/browser tests. The
  checkout already contained concurrent implementation/UI/journal edits; preserved.
- Work performed and changed files: added `tests/events-browser.mjs`, this folder
  guide/report, final JSON receipt and five synthetic actual-map screenshots.
  Only assigned tests/evidence were edited. No child agents, live services,
  credentials, cloud changes or implementation edits.
- Decisions and assumptions: independent SQL database uses all real001–027
  migrations. The seed roster is removed only inside the ephemeral database and
  replaced with synthetic identities using four unique approved portrait paths.
  Real event upserts use the actual event service/storage adapter and SQL RPC;
  deliberately denied/expired/cancelled fixtures use SQL owner writes. Reads use
  the actual source authorizer with an injected synthetic Discord originals
  service. Browser HTTP principal is injected, while normal API auth failures are
  exercised by the separate existing command suite.

Executed checks:

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run test:map-events` | Exit0;57tests pass,0fail/skip | Real SQL migration/backfill/cutover, constraints and CAS; event service, map projection, tools, source policy and API regression suites. Log `/tmp/events-test-map-events.log`. |
| `npm run test:agent-automation` | Exit0;138tests pass,0fail/skip | Queue/checkpoint/Google/Calendar/prompt and real shared map-tool invocation regressions; no live model. Log `/tmp/events-test-automation.log`. |
| `node tests/events-browser.mjs` | Exit0;12checks pass | `browser-report.json`, five synthetic PNGs; installed Chrome, actual Hono/Vite/assets/frontend. |
| `git diff --check -- tests/events-browser.mjs` | Exit0 | Owned harness whitespace check. New reports inspected directly. |

The final browser run independently verifies:

1. Real migrations001–027apply and remove both legacy building JSON columns.
2. Real service/store creates a shared event with two building and two person
   relationships, without primary or person-specific building assignment.
3. Both people appear at Bobst, Courant and an independent simultaneous Stern
   activity; overlapping Bobst activities produce one avatar/person/building and
   preserve both activity records. Future plans stay upcoming. Cancelled/unknown
   events, declined participation, future arrivals and ended participation create
   no current avatar. A denied event and independently denied participant do not
   leak private names, source identity, source records, email or provider IDs.
4. Real campus loads without failed assets and contains exactly six qualifying
   person/building markers; future-only person has none.
5. Bobst focus displays scheduled cards and two loaded attendee portrait images.
6. Courant selection changes camera position, displays the same participants and
   preserves exact landmark world bounds, mesh counts and triangle counts.
7. Person Schedule displays simultaneous current locations plus future Kimmel and
   future Bobst plans without premature Kimmel avatars.
8. Future return to Bobst remains in Schedule while the person is focused at Bobst.
9.390pxviewport has a contained usable card with attendee portraits and no page
   horizontal overflow. Desktop and mobile screenshots were visually inspected.
10. Actual frontend accepts201extra scheduled events and displays Tokyo all-day
    events using the correct local calendar date.
11. Current source revocation removes all corresponding avatars/events after real
    refresh; API remains `Cache-Control: no-store` and does not retain denied data.
12. No uncaught page errors, console errors or failed browser requests. The final
    run executed28actual event-adapter RPCs and784current-source checks.

Findings / fixes / limitations:

- Initial harness assumptions required correction: current startup automatically
  enters instead of exposing an Enter button; migration-seeded people reserve
  unique avatar paths. These were fixture errors, corrected only in the harness.
- Independent source inspection identified upcoming plans being filtered out when
  their building matched the currently focused building. Root removed that filter;
  the added actual-browser Bobst-return regression passes. No claim of a captured
  pre-fix browser failure is made.
- Root/evaluator's frontend capacity and all-day timezone fixes are independently
  confirmed through the real browser, with201rows and a Tokyo date fixture.
- Browser evidence uses a synthetic database/source service and injected member
  principal. Hosted migration/data preservation, real bot/model behavior,
  production member authentication, deployment, physical touch devices and GPU/FPS
  are not established by this pass. Exact geometry invariants and camera
  transitions are checked; there was no full map coordinate survey or new geometry.

- Acceptance verdict and remaining work: **PASS** for assigned local schema,
  runtime, source-policy and actual frontend acceptance. No remaining tester
  blocker. Hosted cutover/live data receipt belongs to the orchestrator.
- Folder-guide updates needed: this evidence `info.md` added. Root owns
  `tests/info.md`, shared milestone/to-do/history and integration documentation.
- Handoff and recommended next action: evaluator reviews final12/12receipt and
  root journals acceptance before integrating/applying the verified hosted027
  cutover. Preserve unrelated pending work and prior applied migrations.

## Orchestrator hosted integration

Hosted026(20261018170616) and027(20261018171006) are applied. All5legacy presence/plan records and4scheduled events were preserved as9events,9building links and11person links. Before cleanup, both directions of all three semantic comparisons had0missing/0extra records. Both old columns and obsolete RPCs are now absent; building catalogue fields and all26profiles are unchanged. New-table FORCE RLS/browser denial and RPC-only service writes were verified. A real service-role event/building/person RPC probe succeeded inside a rolled-back transaction, leaving0probe events.

A fresh production-build Chrome page read hosted data through the real Hono API, loaded9buildings/4active markers/1unexpired scheduled event/1upcoming relationship at verification time, and matched Bobst's1event row/2attendee portraits with0page errors. The real roster screenshot stays private under /tmp. Current normal preview http://127.0.0.1:5173/ (API3001) was restarted and verified statusok after cutover; extra owned verification servers were stopped. Both builds and final git diff --check pass (frontend retains the existing large-chunk advisory). Update-agent configuration remains disabled; no live model call, Railway deployment or Calendar activation occurred.
