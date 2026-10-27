# All-operation and common-workflow live verification

October 27, 2026, America/New_York.

The editable task catalogue requested by the user is
[docs/agent-tasks.md](../../docs/agent-tasks.md). Preserve manual additions and
stable IDs; add dated results rather than erasing earlier failures.

**45 of 54 operation names have successful actual-model-selected calls through
the private API to real services.** All 54 separately pass offline transport
coverage. This is partial overall live coverage: the user approved exactly one
normal production cycle, then declined additional create/cancel worker cycles.
The nine remaining names and their actual status are in
[coverage.md](coverage.md). Do not claim all 54 live operations or every possible
workflow is accepted.

## What changed

Earlier scoped API corrections preserve invalid unknown-name responses, forbidden
hidden operations and uncertain-write outcomes when completed results cannot be
encoded as JSON. Original service exceptions retain their private stopping
behavior.

Real Calendar and Contacts workflows exposed two further runner-cache defects:

1. After a successful update, a repeated exact read was skipped. The update had
   consumed its private read/revision permission, leaving cancel/delete stuck.
   Reads now have an adapter-specific generation after a successful/partial or
   uncertain write; a later model-selected read can reach that same adapter.
2. An early update correctly returned read_required, but its signature stayed
   cached even after the model supplied the missing read. Only definitely
   rejected read_required/conflict actions may have their signatures retired
   after an actual successful read of the same adapter. Successful and uncertain
   writes keep their replay protection. Backend source, target, field and version
   checks still run; the existing single conflict-refresh allowance is unchanged.

Eight meaningful independent regressions pass. Earlier source reproduces the
original update/reread/delete failures and the two rejected-write recovery cases.
The final frozen transport/cache/Calendar focused run passes 44 checks.

## Completed real-service agent workflows

| Workflow | Actual outcome |
| --- | --- |
| Google mail and Drive reads | Completed actual-model Gmail search/exact read, Drive search/folder listing/exact file read. |
| Calendar single-event lifecycle | Actual model created, read, renamed, genuinely reread and cancelled one exact event. A completed final cancellation answer matched independent live readback. Timing survived the title change; a time-shift workflow was not verified. |
| Calendar batches | Real model selected both batch operations and both cancellations successfully; final answer in that bounded batch conversation hit the evaluation cap. Complete batch conversation remains partial. |
| Contacts full lifecycle | Actual model searched/created/read/updated/reread/deleted in one conversation, returned a completed answer and preserved every other supplied field. Final absence checked. |
| Contacts ambiguity | Two live matching candidates produced a completed clarification with no mutation proposal. Both fixtures stayed unchanged before cleanup. |
| Treg discovery, save by default | One narrow real search followed by a separate Contacts import saved the exact complete native record. Readback hash and completed final confirmation passed. |
| Treg discovery, explicit no-save | One real result; no import, save, enrichment or persistence attempt. Completed final answer. |
| Treg enrichment no-match | A literal existing club-account email was processed, honestly reported no match in the completed answer and saved nothing. A successful matching profile remains untested. |
| Attio lifecycle | Real attribute discovery/create/exact read/scalar update and completed final saved claim matched provider readback. Other tested attributes survived. |
| Discord | Genuine current member/channel authorization; actual catalogue/search/exact read/window/summary/draft calls succeeded. Draft stayed a draft. One authorized labeled marker message was posted in flock-test for the source check. |
| Miro | Real authorized catalogue, board overview and actual native item read succeeded through the existing application token broker. Item content was bounded/partial, not complete-board evidence. |
| Future map plan | Real roster lookup/create/read/cancel through the chat API completed. Fresh independent readbacks confirm both exact temporary plan IDs cancelled. No current-presence claim or unrelated map write. |
| Gmail send | One explicitly authorized test message to the user-supplied destination was accepted and independently found in Sent. Exactly one wire send was attempted. Delivery is not established. The initial send conversation was cap-limited; a later completed conversation read the saved message. |
| Shared memory | Real read and exact-content unchanged save succeeded in a completed conversation. The guard required byte-identical prior content and version. A content-changing memory merge was not tested. |
| Bug reporting | One actual previously reproduced API bug was recorded in a labeled test report. The append-only report remains clearly labeled; no delete operation/grant was added. |

## Exactly one normal production cycle

The user explicitly approved ordinary global lease, queue and both-calendar sync
effects for one cycle. Immediately before launching, metadata showed the normal
lease idle. The launcher used the existing update-agent production environment
unchanged, `createAutomationRuntime({manual:{force:true,channelIds:[]}})`, then
exactly one `handler.tick()`. It did not run a serve loop, restart a service,
steal/fence a lease, enqueue a second manual run, prune outside the normal cycle
or change deployed settings. Normal source grants, rechecks, audit receipts,
lease renewal, optimistic versions and existing budgets stayed active.

The cycle ran 6:08:58–6:11:14 PM New York:

- Claimed-batch outcome: completed, 3 handled / 0 remaining in that claimed batch,
  22 calls and 12 actual model POSTs. This is not a global queue-empty claim.
- Actual model-selected finish_batch, read_pending_task,
  read_context_fragment and resolve_pending_task succeeded against real stores.
  One exact saved task was resolved; full fragment continuation was actually used.
- The separately named automatic sync was dispatched, but returned **partial**.
  Its progress label was failed and source diagnostics classify partial. No full
  synchronization success or model selection of sync is claimed; the retained
  source-free evidence does not identify every underlying projection limitation.
- Follow-up ended at **round_limit**. Unfinished tasks were preserved by normal
  checkpointing. Complete planner/follow-up correctness is not accepted.
- The lease was read back released. No additional worker cycle ran after the user
  selected Stop after the approved cycle.

## Test fixtures, cleanup and privacy

Seven temporary club Calendar events were soft-cancelled and independently read
back. Across CRM passes, eight new Contacts records and two new Attio records
were deleted by their exact created IDs and checked absent. Two map activities
remain cancelled, with fresh exact readbacks at 6:23 PM. One labeled Discord marker
and one labeled append-only bug report remain; one requested Gmail test message
remains in Sent. Existing contacts, Attio records and unrelated test targets were
never allowed by mutation guards. No invitations or additional emails were sent.

Existing Railway credentials stayed in subprocess memory. No environment values,
OAuth refresh files or credentials were written into evidence or checked-in
files. The existing Miro broker was reused without installing a connection or
refreshing copied production OAuth state. Business transports had exact fixture,
method/target and cost guards. Existing Treg per-request cost ceilings were not
changed; successful enrichment and processed no-match are kept distinct.

Only source-free names/statuses/counts, source hashes, fixture manifests and
readback metadata are in the normal test reports. Original errors, denied calls,
budget stops and failed setup remain retained. Native Treg payloads stay in the
existing explicitly authorized private/redacted log path.

## Source isolation and checks

Another chat began a separate prompt/source refactor in the original checkout.
The remaining live tests and production cycle therefore used a fixed snapshot of
02427ba83c1340ff8e7b5bdfa3a1e31518dddd84 plus exactly five owned runtime files:
four operation API modules and chat retrieval execution. An independent reviewer
compared 420 tracked runtime files and confirmed this boundary. The concurrent
prompt refactor was not copied or evaluated here. A source-only runtime patch and
source pins are retained for reproduction. The snapshot later received local
Git metadata solely so the unchanged file-limit script could enumerate its files;
it has no remote and created no deployment or publication.

Checks include independent 379 pass / 1 existing optional skip representative tests,
17 transport scenarios, 8 cache regressions, a 25-check pre-production gate and a
final 44-check focused run. These overlapping checks are not summed as unique
coverage. Scoped Prettier/ESLint, file limits and API/frontend builds are reported
from the fixed snapshot. Frontend retains its existing large-chunk warning. The
full npm test suite/browser suite and the separate moving prompt changes were
not verified by this pass.

## Inference accounting and preserved limitations

The first all-operation evaluation ledger stopped at 96 physical requests. A newly
requested common-workflow round reserved 31 slots, of which 29 reached inference
(two extra reservations were blocked by that caller's tighter local cap). The
focused Calendar recovery used 8/10 and final CRM workflows 22/24. Thus this expanded
pass used 155 evaluation requests plus 12 ordinary production-cycle model requests.
The earlier limited API verification's 26 requests are a separate prior pass.
No ledger was reset; new bounded rounds and their purposes remain distinct. No
application model/call/time budgets were changed.

A first worker simulated-data sample consumed 16 of those 96 requests. Two scenarios
had a fixture defect that omitted fresh queued originals; it was corrected and
checked offline, without claiming a corrected live-model rerun. The original
invented-fragment rejection and the earlier valid unmatched-attendee no-change
failure remain qualified/open. Neither is proof that the API migration introduced
that behavior.

Private ignored evidence:
`evidence/tool-operation-api-all-live-2026-10-27/`, including per-group reports,
all four ledgers, production-cycle report, exact cleanup receipts, source pins,
original failures and focused recovery reports. Durable current outcomes are in
[the common task log](../../docs/agent-tasks.md) and the project milestone.

No deployment, schema migration, remote variable change, commit or push was
performed. Independent final review ACCEPTS the scoped API/cache fixes and qualified evidence.
Complete 54-operation live acceptance and untested common-task variants remain
pending/held as shown. CAL-02 covers a title change with unchanged timing; the
separate time-shift task CAL-05 remains untested.
