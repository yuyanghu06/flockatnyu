# Common agent tasks and live test log

This is the editable list of tasks Flock should handle. Add or change tasks here
manually. Keep the IDs stable so later test results still point to the right task.
An item on this list describes expected behavior; it does not by itself authorize
the agent to change live records or send messages.

Last updated: October 27, 2026, America/New_York.

## How to add a task

Add a row to the appropriate table or a new section. Include an example request
and the result you expect. Use **Not tested** until a complete conversation and
its real saved result have been checked. Keep old failures in the test log.

| Status | Meaning |
| --- | --- |
| Pass | The actual model completed the conversation, real services returned the expected result, and any saved change was checked. |
| Partial | Some steps passed, but a required step, final answer or readback is missing. |
| Failing | A valid test produced the wrong behavior. |
| Blocked | A named prerequisite prevents the test. |
| Not tested | No complete live workflow check has been recorded. |

## Calendar, plans and map

| ID | Example request | Expected result | Latest status |
| --- | --- | --- | --- |
| CAL-01 | “What is happening this week? Use New York times and locations.” | Read the club Calendar first; report incomplete coverage honestly. Use live Miro when Calendar is empty or unavailable. | Partial: real Calendar and Miro reads pass separately; combined fallback workflow not yet checked. |
| CAL-02 | “Add a test meeting, rename it, then cancel it.” | Create one event; read its current version before each change; preserve timing during the rename; cancel that exact event without invitations or touching others; confirm the saved result. | Pass for the title-update variant: the final real-model create/read/update/fresh-read/cancel conversation completed, preserved timing, and its cancellation claim matched independent provider readback. |
| CAL-03 | “Add these two meetings, update both rooms, then cancel both.” | Use separate batch create/update calls, preserve every unrequested field and report each result accurately. | Partial: all real batch/read/cancel calls pass and cleanup is verified; final answer remains unverified. |
| CAL-04 | “This Discord announcement schedules a club workshop.” | Read the exact authorized original, reconcile one club Calendar event and keep its stable source identity through edits/cancellation. | Not tested: additional worker create/cancel cycles were declined. |
| CAL-05 | “Move that meeting 30 minutes later.” | Read the exact current event, change only its start/end as requested, preserve its duration and other fields, and confirm the saved times. | Not tested as a complete live time-shift workflow; CAL-02 verified a title change with unchanged timing. |
| CAL-06 | “Sync Calendar to the map, accepting clear spelling variants and dropping locations outside the map.” | Match only a clear existing building; keep unmatched building links empty without failing the sync; preserve event/attendance data, manual resolutions and real error reporting. | Partial live workflow coverage: repair deployed in source 8718a1c; local regressions and read-only calculation pass. Worker remains paused, so no new cycle applied the intended placement. |
| PLAN-01 | “I’ll study at Bobst tomorrow from 2 to 4.” | Resolve the real speaker, write the separate Member Plans Calendar, then project the plan to the map during its actual window. | Not tested: separate Member Plans create/project workflow requires additional worker cycles, which were declined. |
| PLAN-02 | “Cancel that personal plan.” | Recheck the same original, cancel the same source-owned Member Plan and reflect cancellation on the map. | Not tested: additional worker create/cancel cycles were declined. |
| MAP-01 | “Put Yuyang at Bobst for this explicitly labeled future test.” | Resolve an existing roster person; save only the requested activity/building/person; keep every unrelated event. | Pass for the bounded future-plan workflow: actual model lookup/create/read/cancel completed, and both temporary plans were independently read back cancelled. |
| MAP-02 | “I’ll attend the workshop for its entire time.” | Reuse the correct existing event, inherit its interval and preserve everyone else; do not create a duplicate activity. | Not tested: additional worker attendance cycles were declined. |
| MAP-03 | “Change only my end time to 7 PM New York.” | Preserve the start, people, labels, room, source and other event details. | Not tested in this expanded live pass. |
| MAP-04 | “Plot Alex here.” | Ask who or where when an essential identity/location is unclear; never invent a roster match. | Partial: an unmatched name prevented a live write; focused clarification check remains. |
| MAP-05 | “The old Calendar event was cancelled and replaced.” | Keep distinct events distinct; do not revive the cancelled original or lose supported location/attendance on the replacement. | Failing/open general bug; see notes.md. |

## Finding and summarizing club information

| ID | Example request | Expected result | Latest status |
| --- | --- | --- | --- |
| SRC-01 | “Find this message in #flock-test and link the original.” | Resolve the authorized channel, search it, read the exact returned message and cite its canonical link. | Pass: real model selected catalogue/search/exact read successfully. |
| SRC-02 | “Summarize #flock-test during this time window.” | Read that exact window, preserve coverage limits and summarize supported information only. | Pass for the narrow live verification window. |
| SRC-03 | “Give me an eboard update for this window.” | Read authorized eboard sources, preserve exclusions and report partial coverage; do not sweep individual teams. | Pass for the narrow live verification window. |
| SRC-04 | “Draft this message for #flock-test.” | Return a draft in the invoking conversation after current access checks; do not post it. | Pass: genuine Discord actor/channel authorization and real draft operation succeeded; nothing was posted by the draft tool. |
| SRC-05 | “Find a Gmail message and read it.” | Search the connected club account, then read the exact returned message separately. | Pass in a completed real-model conversation. |
| SRC-06 | “Find a Drive file, list its folder, and read the file.” | Use actual returned IDs, separate folder listing and file reading, preserve bounded-content warnings and never edit the file. | Pass in a completed real-model conversation. |
| SRC-07 | “Read the relevant Miro board item.” | List authorized boards, read board navigation and read the actual returned native item; preserve partial-content warnings. | Pass for the bounded live item read; item result was partial. |

## Contacts, discovery and email

| ID | Example request | Expected result | Latest status |
| --- | --- | --- | --- |
| CRM-01 | “Create this contact, change one field, then delete that test contact.” | Use exact reads/versions, preserve all other fields and finish with an honest answer. | Pass: full actual-model create/read/update/fresh-read/delete in one conversation completed; exact fields and final absence were checked. |
| CRM-02 | “Change Alex’s workplace.” | If several saved contacts fit, ask which one and make no write. | Pass: two real same-name test contacts produced a completed clarification with no mutation; both were preserved and then cleaned up. |
| CRM-03 | “Find people at this company and save the results.” | Perform a narrow Treg people lookup, then separately import complete native returned records into Contacts; preserve existing contacts. | Pass: actual-model narrow lookup, separate complete native import, saved-data readback and final confirmation all completed. |
| CRM-04 | “Find people, but do not save them.” | Return discovery results without Contacts writes or an unrequested enrichment lookup. | Pass: one real lookup completed with no save or enrichment proposal and a completed final answer. |
| CRM-05 | “Enrich this exact email address.” | Use the literal supplied/returned address, distinguish a successful match from a processed no-match, and save successful returned people unless told otherwise. | Pass for no-match handling: exact club-email enrichment completed, final answer honestly reported no match and nothing was saved. Positive matching is not tested. |
| CRM-06 | “Create an Attio test record, read it and update one scalar field.” | Inspect real attribute definitions, use supported values, read the exact UUID before changing it and preserve other fields. | Pass: actual-model Attio create/read/update completed, final saved claim matched readback and the exact fixture was deleted and verified absent. |
| MAIL-01 | “Send this test email to the address I supplied.” | Send exactly once from the fixed club account; keep a durable receipt; distinguish Gmail acceptance from delivery. | Partial: the actual send/readback passed; the combined test conversation’s final answer hit the cap. One labeled message to the user-supplied test address was verified in Sent. |

## Memory, bug reports and unfinished work

| ID | Example request | Expected result | Latest status |
| --- | --- | --- | --- |
| MEM-01 | “Remember this club preference; keep the other notes.” | Read shared memory, merge only the requested lasting fact and use its exact version; do not store source archives. | Partial: real read and exact-content unchanged save passed; a content-changing merge was not tested. |
| BUG-01 | “Report this actual Flock malfunction.” | Record one structured report for the current request and confirm recording without claiming a fix. | Pass for the explicitly labeled reproduced API-bug test record. One labeled report is retained because no delete operation is exposed. |
| WORK-01 | “Keep this unresolved request and come back when its missing detail is available.” | Save exact original intent, read the saved task and resolve only its exact completed version; retain unrelated work. | Partial: live saved-task read, real fragment continuation and one exact resolution succeeded. A complete new defer-to-completion workflow was not tested. |
| WORK-02 | “Continue the long result you just returned.” | Use the actual returned fragment ID and offset; never invent a page or fragment ID. | Pass for real continuation: the production model used returned fragment IDs/offsets successfully. The earlier invalid simulated-source fixture and invented-ID rejection remain in the history. |
| WORK-03 | “Run one normal planner cycle.” | Acquire the ordinary global lease, process the bounded eligible batch, run the separate Calendar-to-map sync after successful initial finish, preserve unfinished tasks and release normally. | Partial: one real cycle handled 3 claimed inputs with 22 calls and released its lease. Automatic Calendar-to-map sync returned partial; follow-up reached its round limit. Further cycles were declined. |
| SAFE-01 | “Use a source that is temporarily unavailable.” | Complete independent work where possible; report the unavailable part and preserve unfinished intent. | Not tested as a full live failure workflow in this pass. |
| SAFE-02 | “Add this unmatched person’s attendance.” | Do not guess identity or discard the request; retain the unfinished attendance for clarification. | Failing in the prior valid five-input simulation; no general fix is claimed. |

## Test log

| Date in New York | Tasks / scope | Result and evidence |
| --- | --- | --- |
| 2026-10-27 | Operation API transport | All 54 routes passed transport checks. This is offline evidence, separate from live workflows. |
| 2026-10-27 | Real Google and CRM tool calls | All 25 assigned operation names eventually reached real services successfully through actual model calls. Initial cached reads blocked cancellation/deletion; the fix passed mechanical regressions and real tool retests. Final-answer streams in the retests hit the shared evaluation cap. |
| 2026-10-27 | Real Discord, Miro, memory, bug, map and email calls | Remaining chat operation names reached real services through actual model calls. One email was accepted and verified in Sent; the temporary map plan was cancelled. Read-only Discord marker and one labeled bug report remain. |
| 2026-10-27 | Worker model sample | 16 actual inference calls used simulated business services. Coverage was incomplete; two scenarios had a fixture defect that was corrected offline. Do not count them as successful live worker workflows. |

| 2026-10-27 | Markdown prompt actual-model simulations | 50 gpt-6-luna inference requests with production runners and simulated business data: six semantic passes, ambiguous Contacts mutation failure and repeated-empty Calendar completion failure. Original assertion/cap results retained; no real-service rows are upgraded. [Verification](../milestones/prompt-markdown-live-2026-10-27/verification.md). |

| 2026-10-27 | Contact clarification and Calendar completion prompt retest | 40 new gpt-6-luna requests with simulated services: both original failure reproductions pass. Clarification continuation, exact-field preservation, partial/unavailable Calendar and native Miro content fallback are supported. Six strict groups pass; two additional outcomes are accepted with semantic/oracle qualifications. [Verification](../milestones/prompt-clarification-completion-2026-10-27/verification.md). |

Detailed results: [current milestone](../milestones/milestone.md),
[expanded live test scope](../milestones/tool-operation-api-all-live-2026-10-27/info.md).

## Add tasks here

| ID | Example request | Expected result | Latest status |
| --- | --- | --- | --- |
| NEW-01 |  |  | Not tested |

## Follow-up test log — October 27, 2026

- **45/54 operation names** have successful actual-model calls to real services. The remaining worker names and automatic partial sync are listed in [the coverage matrix](../milestones/tool-operation-api-all-live-2026-10-27/coverage.md). Successful calls are separate from complete workflow acceptance.
- Fixed two related chat-cache failures: fresh reads after writes now execute, and an action rejected for a missing read may be proposed again after an actual successful read. Confirmed/uncertain writes retain replay protection. Eight independent regressions pass.
- **CAL-02 passes for renaming:** complete same-conversation live creation, title update, fresh reread, cancellation and honest final answer; timing preserved and independent cancellation readback. A time-shift variant remains untested as CAL-05.
- **CRM-01/02/03/04/05/06 pass in their recorded variants:** full Contacts lifecycle, ambiguity, default native import, explicit no-save, enrichment no-match and full Attio lifecycle. All created CRM records were cleaned up. Successful enrichment matching remains untested.
- **MAP-01 passes for a future test plan:** model conversation completed; fresh checks at 6:23 PM New York confirmed both exact temporary map plans cancelled. One labeled test email was accepted and found in Sent; delivery is not established.
- **WORK-03 is partial:** exactly one approved normal production cycle handled 3 claimed originals, made 22 calls/12 model requests and released the lease. Sync returned partial; follow-up ended at its round limit. This does not establish an empty global queue. The user declined additional cycles; no additional worker cycle was run.
- Test execution used a fixed source snapshot of 02427ba plus the scoped API/cache corrections while another chat edited prompts in the original checkout. The separate prompt refactor is not covered by these results.

## Calendar sync repair — October 27, 2026

CAL-06 records the selected forgiving building-name matching and dropping of
unmatched building links. Unknown locations no longer make the whole sync
partial. Calendar/event/attendance facts remain intact; ambiguous matches and
real errors still remain partial. Independent offline checks and a guarded
read-only provider check pass. The intended E-Lab placement change was not
applied. WORK-03 retains the original cycle's partial/round-limit outcome;
no additional cycle ran. See [the repair evidence](../milestones/calendar-sync-location-fix-2026-10-27/verification.md).

## Full-tree deployment — October 27, 2026

All five services received the reviewed source 8718a1c packages. Web/collector
readiness is verified; update-agent remains disabled and enrichment awaits its
normal schedule. No new production cycle or business-write smoke test was run.
CAL-06's code is deployed, but actual placement application and prior worker
workflow gaps remain unverified. [Deployment receipts](../milestones/full-tree-release-2026-10-27/verification.md).
