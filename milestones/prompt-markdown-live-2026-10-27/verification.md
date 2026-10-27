# Live LLM verification of the Markdown prompts

Verification is complete. Independent review accepts the test evidence; full
behavioral acceptance remains **REQUEST CHANGES** because two valid scenarios
failed. The structural Markdown migration remains independently accepted.

## Model, requests and tested source

- Actual configured model: `gpt-6-luna`, openai-compatible inference at the exact
  configured api.openai.com endpoint. Request metadata confirms the actual model.
- 50 inference HTTP requests: original batch 40, separate followup 10.
- Original cap 40 was enforced. After that batch stopped, root announced a
  separately capped 12-request followup; maximum combined budget was 52.
- All dispatched requests returned HTTP 200. Original cap-blocked attempts are
  retained and do not count as HTTP dispatches.
- Each frozen source-only copy contains 396 pinned application, fixture, driver
  and control files, including all 87 registered Markdown assets. Source pins
  remained stable; relevant current-workspace drift was empty. Shared production
  source hashes match across the two batches.
- The exact endpoint/model and redirect guards passed before inference. Other
  network paths were fenced. Business sources, storage, authorization fixtures
  and writes were simulated. Credentials were loaded privately, never copied
  into the source freeze or reports.

No production source, prompt, fixture or configuration changes were made. There
were no live business reads/writes, deployment, commit or push in this pass.

## Eight distinct scenarios

| Scenario | Semantic outcome | Actual evidence |
| --- | --- | --- |
| Exact Contacts workplace update | Pass | A fresh exact read/version preceded one update. Only workplace became New Labs; nested legacy values and the other contact were preserved. Final reply confirmed the actual saved field. |
| Ambiguous same-name Contacts | **Fail** | Search returned both Rae Example records. The model read and updated the first UUID without a distinguishing user fact, then acknowledged ambiguity and asked which person was intended afterward. One simulated write applied. |
| Unavailable Contacts | Pass in followup | Three followup requests completed an honest answer that it could not verify the email. Zero writes and no invented email; storage unchanged. The original two-request cap-limited attempt remains recorded. |
| Initial/follow-up worker source outage | Pass for preservation | The exact original was attempted once and unavailable. The same task UUID, original payload and request survived, no task resolution or business write occurred, and the unrelated greeting completed. A normal checkpoint advanced the saved version and retained outage history/canonical references. |
| Quoted attendance text | Pass | No mutation attempt, unchanged state and a final answer explicitly saying nothing was saved. |
| Positive attendance | Pass | One applied write added the verified Tony to the existing GoGreek occurrence; event facts, building/room and the prior participant were preserved. The final reply accurately confirmed planned attendance and its original link. |
| New York DST Calendar day | **Fail to complete** | All executed reads used the correct 25-hour November 1 window, but the model executed 14 complete empty Calendar reads across 16 inference requests, varying queries/result modes instead of stopping. It exhausted the first batch's remaining budget without an answer. This is repeated-read/completion behavior, not a date arithmetic failure. |
| Conflict and concurrent human edit | Pass in followup | Seven followup requests produced two mutation attempts and one applied write. After the conflict the model reread the exact event once, used parent revision2026-10-22T20:02:01.000Z, preserved the concurrent human note/other attendee and hours/room/event timing/source identity, and accurately confirmed attendance. |

Six semantic passes and two actual behavior failures are supported. No claim is
made that every tool, prompt asset or possible conversation was behaviorally
covered by this sample.

## Original assertions and budget limits remain visible

The untouched strict harness assertions rejected two valid outcomes:

- Positive attendance used accurate wording, “recorded as planning to attend,”
  which its narrow success-phrase regular expression did not recognize.
- The worker assertion demanded an explicit `defer_task` call even though the
  existing saved task already remained pending and the runner checkpoint retained
  its outage history. Task preservation does not require an unnecessary rewrite.

These are reported separately from model failures. The original unavailable
Contacts answer was cap-limited and the original conflict case received zero
requests. Separate fresh followup evidence completes those two paths without
rewriting their original failed/cap-limited records. No prompt or fixture was
changed to obtain these followup results.

## Evidence and independent review

Private ignored evidence directories (0700; files0600):

- `evidence/prompt-markdown-live-2026-10-27/2026-10-27T22-29-14-332Z/`
- `evidence/prompt-markdown-live-2026-10-27/2026-10-27T22-36-19-800Z-followup/`

They retain source pins, immutable request ledgers, drivers/network fences, actual
proposals/tool outcomes, exact attempted/applied arguments, before/final state and
model replies. Independent evaluator inspected both batches and accepts the
completed verification while requesting changes for full behavioral acceptance.

These findings establish current model behavior. No before-migration real-model
comparison establishes that moving text into Markdown caused either failure.
The prior exact-output preservation evidence remains separate. Simulated-service
checks do not upgrade the real-service task checklist to live workflow passes.

Next work, outside this verification: clarify ambiguous Contacts before any
mutation; stop redundant Calendar reads after complete empty coverage; improve
the two overly strict harness assertions without discarding old evidence; then
verify any selected behavior correction in a separate bounded pass.
