# Chat times, Spotlight queue and map recovery — October 23

The release covers three requests: use local times correctly, queue Spotlight messages, and stop failed map writes from restarting completed person lookups. Local verification is complete; hosted release receipts are recorded in the rolling milestone.

## Behavior

Chat sends new or changed map boundaries as local date/clock values in an IANA timezone. The server converts them using the actual date's timezone rules. In New York, 7 PM on October 23 becomes 23:00Z; 7 PM on December 15 becomes 00:00Z the next day. Invalid, nonexistent or repeated daylight-saving clock times require clarification. Raw timestamps can be copied only byte-for-byte from the same event/person read during that request. Current presence keeps the trusted request start and existing two-hour default when no end is supplied. Shared worker/storage time contracts are unchanged.

Map reads and applied submission receipts expose derived local labels and clocks, including effective inherited participant hours. Those hints are not stored. Optional null input times are omitted in model-facing reads; private snapshots retain exact nulls. Successful transaction receipts confirm the submitted fields, rather than implying an automatic independent readback. Existing opaque links and unchanged provenance may be omitted so the adapter retains their exact values.

Spotlight holds up to 10 active/waiting messages and 20 MiB of files across active, waiting and draft messages. It captures each message's text, files and selected building, then sends messages in order with preceding completed answers. Remove/Clear affect waiting messages. Separate Stop or a failed/incomplete/empty response pauses the queue and retains the incomplete message for explicit Resume, preserving newer drafts. Closing Spotlight continues processing; loading failure pauses and retains; disposal cancels and clears. Reload clears this in-memory queue.

Failed map writes return safe validation reasons and public submitted-row indices. Equivalent successful lookup calls are recognized despite object-key order or equivalent name whitespace/case, while malformed arguments retain normal validation feedback. Chat reuses known people, repairs only a supported missing field, and preserves unrelated facts. Conflict handling uses an explicit targeted read and fresh revision. An unavailable result is unconfirmed because storage may have committed before its response was lost; a separate map read may reconcile it. Tools remain separate operations, and budgets and permission/version checks are unchanged.

A pure request-local comparison can state that an identical deduplicated proposal matches the same authorized read. It checks accepted storage fields, byte-exact scalar strings, matching visible relations, exact revision, principal scope and latest valid read receipt. Later explicit reads—including failures, denial and exceptions—clear old hint eligibility. The hint does no I/O, decides no user intent, authorizes no write and does not establish current database truth or successful storage.

Target selection precedes state comparison and recovery. Unresolved candidates for one request are not independent actions. If ambiguity is the only remaining action, tool selection returns zero calls immediately; the separate answer stage asks which entry. Filtered reads chosen by the model cannot establish a user selection. A small worked example and chat's event-ID description explain that interface.

## Verification boundaries

| Boundary | Evidence |
| --- | --- |
| Spotlight input → queue → requests | Seven independent Chrome scenario groups cover FIFO/history/files/buildings, removal, Stop/failure/Resume, hidden processing, disposal, limits, IME/offline and compact layout |
| Response → visible transcript | Desktop/mobile images inspected; scroll checks at 1280 × 844, 390 × 844 and 390 × 480 preserve manual scroll and at least 21.5 px reply clearance |
| Chat → map adapters/storage | Focused component suites pass; final coder set has 120 checks, including clocks, exact copies, validation, conflict/failure feedback, identity reuse, freshness and privacy |
| Model decisions → exact saved fields | Configured gpt-6-luna through production chat/provider/map runner and adapters, with simulated business storage, real inference and exact field/proposal/final-answer assertions |
| Hosted assets/API | Separate authenticated read-only release check verifies deployed frontend bytes, new time/selection tool contract, access gating and configured chat; receipt belongs in milestone/evidence |

Component sets overlap and are not added together. API/frontend builds and whitespace checks pass. A broader legacy group has 14 failing test names; an isolated original-HEAD baseline has the same 14, so those older source-workflow expectations are neither counted as passing nor attributed to this release. A physical phone/software keyboard was not used. No map geometry or rendering changes are included.

## Actual model outcomes

All model gates restrict network access to the exact configured inference endpoint, block redirects, enforce hard request caps including retries, and retain matching source files and hashes. Business services are simulated; no live Discord, Calendar or database writes occur. Recovery gates clearly label a scripted known-failure prefix through the production runner/adapters, followed by actual model decisions. They test recovery rather than the initial tool choice.

| Scenario | Observed outcome |
| --- | --- |
| Reported Stern correction | Correct 23:00Z with original start, four people, labels and room preserved; accurate local 7 PM answer |
| Summer/winter current presence | Correct 23:00Z / next-day 00:00Z and local answers |
| Attendance preservation | After the null-input fix, one addition preserves existing microseconds, labels, overrides and unrelated fields |
| Unavailable initial read | No save and honest explanation |
| Final ambiguous Stern request | One read exposes both rooms, then empty tool selection; zero further reads/lookups/mutation proposals/attempts/writes; focused room question |
| Final explicit second-room request | Exactly that entry ends at 23:00Z / 7 PM New York; first entry, both room relations and all participants remain exact |
| Final duplicate/new-attendee recovery | One corrected 10-person save, no identity relookups; existing facts and opaque URL exact |
| Final lost-response recovery | Scripted write actually commits once but yields no applied receipt; model chooses one separate exact-event read, confirms recorded state accurately and makes no retry write or lookup |
| Conflict with concurrent human edits | Earlier recovery gate rereads once and preserves human notes/participant label while making the requested addition; not rerun after the final prompt-interface change |
| Already-correct attendance | Strict no-redundant-mutation objective remains FAILED and was not rerun after the final interface change; see limitation below |

Initial successful Stern/seasonal cases were not rerun after later prompt-only changes. Final selected-room behavior and current deterministic clock tests verify the conversion path; the bounded cases do not establish perfect behavior on every request.

## Retained failures and request accounting

The following closed gates used **95 actual inference requests total**, including failures. Original ledgers and oracles remain intact.

| Gate | Used / hard cap | Result |
| --- | --- | --- |
| Initial time scenarios | 24 / 24 | Inherited-null rejection and ambiguous target guess; three other raw failures were a regex rejecting “7:00 PM,” corrected only in a separate offline report |
| Time failed-case retry | 11 / 12 | Attendance passed; ambiguous target still changed before asking |
| Initial target-selection final | 7 / 12 | Both unclear and explicit-room cases passed on that earlier runtime |
| Initial recovery | 12 / 20 | No lookup loops; conflict/lost-response cases passed; redundant save and opaque-URL alteration failed |
| Recovery failed-case retry | 6 / 10 | URL preservation passed; redundant save still failed |
| Exact-read-hint already-recorded test | 3 / 5 | Equality hint received, but redundant save still failed the unchanged oracle |
| Combined target regression | 8 / 12 | Explicit room passed; ambiguous request changed first room before asking—release blocked |
| Hierarchy-only target retry | 11 / 12 | Explicit room passed; ambiguous request still proposed first target; accidental field validation prevented storage, which did not satisfy the oracle |
| Final interface target gate | 7 / 12 | Both original cases passed; all 21 source pins stable |
| Final recovery gate | 6 / 8 | Needed-attendee and lost-response cases passed; all 22 source pins stable |

The final correction explains that the tool-selection stage must end with zero calls before the answer stage can ask a question. It adds event-ID selection guidance and avoids repeating the full recovery workflow in the upsert description. No backend target parser, resolver tool, model change, output-token change or runner workflow was added.

## Remaining limitation and live-data scope

The strict already-correct case still produced a redundant save in its last actual test. Simulated business facts remained exact; only the simulated parent revision changed. Production replacement SQL also refreshes relationship creation/update metadata and can cause ordinary optimistic-version contention. This is a retained lower-priority extra-write limitation, not a passing no-op test. It is distinct from the reported lookup loop. No further prompt retries or storage migrations were included to force that optional objective.

A read-only production audit confirmed that the reported Stern entry actually ended at 11 PM New York. Another read-only audit found a rejected 11-row/10-distinct-person proposal followed by repeated lookups across 19 model calls. This release does not automatically repair previously saved entries or resume old failed chat requests.

Private model ledgers, matching sources, screenshots and hosted/package receipts are retained in ignored `evidence/chat-time-queue-2026-10-23/`. Independent acceptance and deployment status are recorded in the milestone journal. Hosted read-only checks are distinct from model simulations and do not establish a live write outcome.
