# Restart handoff: isolated agent tools and fresh local workflows

## Start here

The current implementation is in **/Users/yuyang/.codex/worktrees/tool-isolation/flockatnyu**, branch **codex/tool-isolation**, based on fba416a plus a preserved snapshot of the newer managed candidate. The original root checkout has documentation changes only; its application files have not been overwritten. The other worktree /Users/yuyang/.codex/worktrees/agent-use-case-tests/flockatnyu remains untouched by this task. Do not resume the older GoGreek rollout as though it were this implementation.

The user asked whether they can restart Codex for an unrelated local RAM change. This document saves the exact incomplete checkpoint; it does not claim the requested implementation is finally accepted, integrated or deployed. No live business writes or deployment have been performed. All current model processes are closed and final inference is on hold for restart.

## User requirements

- Ordinary tools perform only their named operation. Map reads/lookups read database data; map writes only write database data. No original/source/identity/task fetches inside map writes.
- Calendar and Member Plans tools only read/change their fixed Calendar. Source/member/identity/map steps are chosen by the model following prompts, not hidden in the tool.
- resolve_pending_task uses already-returned completion evidence and exact saved-task version deletion; no business-service fetch.
- Explicit user exception: successful initial finish_batch automatically invokes **sync_calendars_to_map as a separate named tool call** with its own arguments/result/log/audit/action receipt/budget. finish itself is bookkeeping-only; no automatic sync from caps or ordinary writes.
- After fixes, run fresh local common-task conversations with actual configured chat/planner prompts, production runners/adapters and simulated business responses/storage. Verify tool workflow and actual saved fields. Only configured inference endpoint may be networked; no live Discord/Calendar/database writes. Use last night's use-case milestone examples.

## Implemented locally

Map/source/worker coders completed all12audited paths. Map uses private request-local read context and write-only DB dispatch, local exact source grants, DB-only Miro enabled/team metadata, fixed catalogues and CAS. Source-binding review findings were fixed. Discord window reads return originals; named summaries own summarization. Calendar batch creates only supplied rows, with same-operation idempotency and no semantic discovery/matching.

Worker non-source tools no longer fetch provider originals, identities or other stores. Task resolution uses local proof/exact versions. Separate sync has honest partial/failure results, no successful receipt on failures, respects configured stage caps, and has per-cycle plus mutation-aware action identity. Later Calendar changes can explicitly sync again. Sync preserves protected prior attendance, catches stale edits and includes exact changed occurrences outside its rolling window. Already-absent/already-cancelled exact Calendar cancellations can finish their tasks locally.

Latest two bounded changes after the closed model gates:
1. tools/map/index.js + tools/map/chat.js + server/assistant-context.js clarify expectedUpdatedAt must be TOP LEVEL beside event/buildings/people; schema unchanged, no repair.
2. server/assistant-context.js now explicitly says unnamed-source empty/unavailable Calendar requests remain incomplete until separate live Miro content is attempted (or actual access/unavailability/no-target result).
3. server/automation/adapters.js adds **validateStoredMemberParticipation** for the named sync only. It trusts the Calendar client's verified signed Member Plan metadata plus current exact local source binding/grants, so old plans do not require their original and identity lookup again this cycle. Ordinary Member Plan writes retain their existing local current-request evidence checks. This last stored-plan correction still needs its dedicated positive/negative regression; the tester may append that result to the private handoff noted below before restart.

## Verification so far

- Map144focused checks across11files pass, including actual DB transport, source bindings, invisible prior participants, source-down saved reads and stale CAS. Source176focused checks across10files pass. Worker96focused checks passed before final parent additions; latest worker-tool-isolation has15checks passing including cross-cycle sync identity/cancellation receipt cases. Counts overlap and must not be summed.
- Parent Calendar sync/private attendance/future occurrence cases pass. API syntax/dependency checks pass; Vite build passed with its existing bundle-size warning.
- Untouched historical/hash-linked candidate suites still encode superseded hidden workflows or old private fixture hashes; they are NOT claimed passing and must not be silently edited to inflate totals. All historical SQL fixtures remain intact.

Actual configured model: **openai-compatible/gpt-6-luna**, api.openai.com. Credentials only in root's ignored .env; never copied or printed. Business stores are simulated.

Closed immutable ledgers:
- Base6 **37/48** requests: machine4PASS/2FAIL. Saved-map/source-down and existing-event attendance preserved facts. Announcement+separate sync passed. Conflict never reachedDB because expectedUpdatedAt was nested incorrectly. Member Plan had a stale test-only empty Discord schema. Source-outage machinePASS was weaker: zero source dispatch and task count grew1to2. Preserve these outcomes and limitations.
- Corrected3 **11/24**, all machinePASS: real conflict attempted once with zero apply/honest unsaved; exact3–5PM Member Plan Calendar write followed by separately recorded sync; actual unavailable-source dispatch with the same pending task retained and zero writes. That outage case ends invalid_completion because the model redundantly marks an already-covered original as noChange; it proves pending-work protection, not graceful normal completion.
- Common4 **21/32**, two PASS/two FAIL: human cancellation beats a later bot recap; relative first-hour attendance3–4PM on existing3–5PM event preserves human Calendar and resolves task. Calendar-empty Miro fallback genuinely omitted Miro despite tools being available. Drive-copy fixture failed to support valid search/list requests, so no duplicate workflow claim can be made from that failure.

**69 inference dispatches total so far.** Unused caps are not transferred or reused. All old pins/preimages/results/locks are retained.

## Next actions

1. Read latest private tester checkpoint: **evidence/tool-isolation/verification/restart-handoff.md** and **restart-status.json** inside the isolated worktree. They contain exact filenames/commands and may include the latest zero-network stored-plan test result.
2. Verify validateStoredMemberParticipation with an older correctly signed plan moved in Calendar during a new unrelated cycle, zero old source reads/lookups. It must project correctly. Revoked source, provider/channel mismatch, forged signature and untrackable person must remain blocked/preserved. The independent reviewer reproduced the old failure; do not assume the new callback is verified just because generic sync tests pass.
3. Have a read-only evaluator inspect that correction and the final test setup. Three previous roles are done; tester/reviewer may need respawning after restart. Use the same role configs/ownership/report workflow.
4. Freshly freeze/pin the FINAL two-case test setup once. **final-common-manifest.json** predeclares hard24requests (Miro10,Drive14); currently zero requests/no lock/no final pins. Faithful Drive search/list/exact metadata/CSV routes are now prepared and zero-network checked. Source is currently not finally accepted. Exact run commands are in the private tester handoff.
5. Run final Miro fallback and Drive duplicate-aware copy cases exactly once using actual model+production adapters on simulated services. Inspect proposals, actual dispatches, attempted/applied writes, exact saved fields and answers. Do not reset used ledgers, delete locks, borrow unused requests, or silently change an oracle/source during a batch. Retain failures; any new correction needs a separate explicitly bounded ledger.
6. Independently review final semantics and tool boundaries. Only then safely integrate application changes from the isolated branch into the original root, preserving all existing root documentation/user edits and the other managed worktree. Root runtime files currently match originalHEAD and have not received these changes. No final acceptance, integration, commit/push or deployment is claimed.

## Preserved files and backups

- Detailed evidence and harnesses: isolated worktree **evidence/tool-isolation/** (ignored).
- Preimplementation source/test snapshot: **evidence/tool-isolation/baseline/**.
- Root restart backup: **evidence/tool-isolation/restart-checkpoint/** contains a binary-safe tracked patch, copies of untracked application/test/docs files, and a hash manifest. It excludes credentials and private model evidence.
- Shared user rule and explicit finish-to-sync exception are already recorded in both root and isolated AGENTS.md.
