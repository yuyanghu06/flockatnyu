# Isolated tool workflow verification — October 23

The twelve audited operation paths are corrected locally. Ordinary tools stay on their named service or saved data; chat and planner prompts choose source, Calendar, member, identity and map steps separately. A successful initial finish retains the user-authorized exception: the runner invokes `sync_calendars_to_map` as its own named call with arguments, result, execution record, action receipt, audit, budget and lease checks. `finish_batch` itself only handles bookkeeping. A cap alone does not invoke sync.

Map reads and exact/name person lookups use saved database data without provider originals. Existing map writes reuse a private explicit-read snapshot and issue one conditional database write. Local permissions, exact provider/source/channel bindings, fixed catalogues, complete relationships, private prior attendance and parent event versions remain enforced. Calendar/Member Plans tools touch only their pinned Calendar; same-service exact-ID version/authentication checks remain. Task resolution consumes already-returned matching applied evidence and deletes only its exact task version.

## Actual-model conversations

Configured `openai-compatible/gpt-6-luna` ran through production chat/planner runners and tool adapters with simulated business responses and in-memory Calendar/map/task stores. Only the configured inference endpoint was networked. No live Discord, Calendar, database or other business-service writes were made by these evaluations.

The immutable ledgers contain **95 inference dispatches**, including retained failures, not 95 passing tests: base 37/48, corrected 11/24, common 21/32, final-common 13/24, outage 5/10 and corrected-outage 8/10. Unused budgets were not reused. Each request was reserved before dispatch, source pins checked, and each run closed without a retake.

| Task | Latest observed behavior |
| --- | --- |
| Read saved map when originals are unavailable | Returns saved events; no provider fetch or mutation. |
| Add attendance to an existing event | Keeps event fields, building notes, prior people and their intervals. |
| Concurrent human edit | Actual conditional write conflicts; nothing applies; answer honestly says unsaved. |
| Club announcement | Uses separate source/Calendar operations and separately recorded sync; saves the correct occurrence. |
| Member Plan | Writes the pinned Member Plans Calendar at the correct local time, then separate sync projects one map event. |
| Human cancellation versus later bot recap | Follows the actual human cancellation and avoids reviving the event from the recap. |
| First-hour attendance | Saves3–4 PM attendance on an existing3–5 PM event; leaves human Calendar fields unchanged and resolves matching work. |
| Empty Calendar schedule | Separately lists/searches/reads actual Miro canvas content, then answers with the workshop date,3–4 PM, Bobst 101 and original Miro link; zero writes. |
| Copy spreadsheet events | Separately reads/exports sheet and lists Calendar; creates only missing5–6 PM row, preserves exact existing human event and skips blank title. |
| Source outage with pending work | Current queue-ref/count-only task coverage is visible; model explicitly handles that queue ref, retains the same sole task, makes no Calendar/map mutation, sees actual separate sync result after reset and finishes normally. |

## Corrections and preserved limits

The first conflict case never reached the database because the model nested the version token inside `event`; top-level argument guidance corrected it and the actual conflict rerun passed. Early Member Plan/source-outage tests used an obsolete empty Discord schema; corrected production schemas replaced that fixture before fresh gates. The first Miro case omitted fallback; prompt clarification corrected it. The first Drive fixture did not support valid discovery routes; the faithful fixture now does.

Final Miro's raw machine result remains FAIL because its time regex rejected the correct natural range “3–4 PM.” Both tester and independent evaluator reviewed the actual calls, answer, date/time/location/link and zero writes as semantic PASS; no retake or silent oracle edit occurred.

Two genuine outage failures remain recorded: invalid no-change accounting, then empty initial disposition causing a duplicate checkpoint. The final correction exposes exact saved-task coverage without task contents, prevents duplicate generic checkpoints and preserves omitted queue inputs. The last 8-request gate passes normal completion, exactly one pending task, actual failed source reads and visible separate sync. It supersedes the earlier failure rather than erasing it.

## Independent boundary checks

Actual map/Calendar/worker clients and runners over simulated stores verify isolated dispatch, exact local source bindings, stale parent versions, private prior attendance, exact task deletion, budgets, caps and partial/failed receipts. An older signed Member Plan can move in Calendar during an unrelated new cycle and project into the same map event with zero old-source or identity reads. Forged signatures, revoked policy, wrong provider/channel binding and untrackable people remain blocked and preserve existing map data.

Ready, partial and failed named sync results remain visible when the follow-up transcript resets. Large partial results retain top-level `partial` across lossless fragments and never complete a success receipt, for both explicit model calls and automatic runner calls;180 unresolved entries are recoverable through seven fragment reads without another business request.

API syntax/dependency and frontend builds pass. Auth/package checks pass. Current packages contain exact reachable source and approved built assets with pinned production dependencies; no credentials, evidence, tests, Git or private local files. Worker settings remain 16 calls per reply, 64 per stage, 16 initial rounds, 10 follow-up rounds and 600 seconds; no new limits or timeouts.

Some inherited experimental regressions depend on ignored private replay artifacts or hardcoded hashes of an older test file. Those are separately recorded as unavailable/stale fixture checks, never claimed green or as evidence that the current runtime failed. The affected ordinary staged fixtures were updated deliberately with explicit reads/sync and the same meaningful preservation/authorization assertions. Independent final combined verification reports184passes, zero failures and one optional unavailable private historical replay. Counts overlap earlier checks.

## Release state

Independent evaluator accepted the final implementation/model evidence/packages. Source checkpoint `d6ccfc5` was safely integrated into the original checkout. Railway web `33f90fb7-0134-4489-b6cf-aa0e9b576ac4` and worker `ae88da62-af5d-4d37-b0bf-7288a2e31963` both report SUCCESS at https://flock.techatnyu.org.

All eight live read-only checks pass: health, password login, anonymous API denial, exact built index, updated tool definitions, saved-map read without an attached original, map display and planner denial of website-cookie-only authorization. The saved-map tool returned29visibleevents in1.595seconds, compared with the original approximately60second timeouts; map display took1.466seconds. This is one observed request, not a load benchmark or a freshness claim about provider originals.

Worker container startup, normal lease/busy status, successful prepare/model and separate source reads are observed in organic run `497e1534-1349-4687-a847-4fad96e5ec51`. A complete live Calendar/map mutation cycle was not performed as a test; actual-model simulations above verify that workflow. No live event/source mutation or model call was made by the deployment smoke. Collectors, schema and configuration remain unchanged; authorized organic worker processing continues.
