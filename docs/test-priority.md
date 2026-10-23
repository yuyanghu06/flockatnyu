# Which remaining tests are essential?

My recommendation is to protect **1,627 of the accepted 2,353 individual cases (69%) as essential** for the current club assistant, Calendar, Discord, worker and map. This is a judgment about what each test checks. It does not establish the smallest sufficient suite.

| Priority | Cases | Recommended treatment |
| --- | ---: | --- |
| Essential | **1,627** | Keep tests that directly protect core behavior and high-impact failures. |
| Useful | **548** | Keep for now; simplify repeated variants when changing that area. |
| Protected historical | **139** | Keep under the existing project instruction preserving historical SQL fixtures. |
| Needs retirement review | **39** | Check overlap or replace weak checks before deleting. |
| **Total** | **2,353** | Individual cases only; 40 grouping parents are excluded. |

The remaining **726** cases are outside the essential group. Their lower priority does not establish that they can all be removed safely.

## What the essential cases do

- Stop unauthorized people or sources from reading private information or changing Calendar/map records. Verify the correct Discord speaker, participant, channel and Calendar occurrence.
- Preserve event details and human edits, reject stale updates, and distinguish successful, failed and partially completed changes.
- Keep unfinished work through crashes, retries, lease loss, limits and incomplete batches. Prevent duplicate processing and skipped incoming messages.
- Keep model/network work bounded, honor cancellation, prevent unsafe external fetches and keep private content out of diagnostics.
- Check ordinary chat/retrieval, Calendar scheduling, attendance, active/future map display and New York date/time behavior.

An important module alone does not make every test essential. Extra display formats, supported configuration variants, repeated diagnostic mappings, optional compatibility modes and repeated input permutations generally fall into useful coverage unless they exercise a distinct high-impact failure path.

## Breakdown by review assignment

| Assigned area | Essential | Useful | Historical | Review | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Discord | 595 | 219 | 73 | 7 | 894 |
| Calendar, map and worker | 615 | 122 | 40 | 24 | 801 |
| Shared platform, assistant and other integrations | 417 | 207 | 26 | 8 | 658 |
| **Total** | **1,627** | **548** | **139** | **39** | **2,353** |

The platform assignment includes provider APIs, website access, Google/Miro integration, private audit records and shared assistant behavior. These are review partitions, not a count of distinct features.

## What to review for the next reduction

The 39 cases include 20 scripted Calendar wording/history variants, two exact internal authorization-call-count checks, prompt/schema wording checks, a nominal abort/reader test that never opens a reader, retired-command/no-op checks, an unused stored-summary fallback hook, an old pre-upgrade failure demonstration and some repeated cursor/diagnostic checks. Each candidate's reason names stronger related coverage or the missing evidence that must be checked first.

Some candidates need a better test rather than deletion. For example, the OAuth callback test searches source text for security-related words; real callback behavior still needs protection. The 139 protected historical cases remain separate even where their feature has been retired.

[The complete classification CSV](test-priority.csv) records every baseline case, its priority and a concrete reason. Filter `tier=review` for all 39 candidates. `baseline_line` points to the earlier inventory location and may differ from current source after other changes.

## Method and limits

Three separate reviewers inspected their assigned test bodies, generated variant inputs, fixtures and relevant runtime paths. The orchestrator checked the combined IDs, every per-file total, protected historical counts, reports and representative assertions. Exactly 2,353 unique baseline IDs appear once across all 169 files; all 139 historical cases reconcile with the accepted inventory.

This review uses the [accepted phase-out snapshot](test-phaseout.md), not a fresh count of concurrent product work. Current test bodies were copied for inspection; baseline identities came from that snapshot's sealed Node events. Later additions, renames and runtime changes belong to their separate work.

No tests were deleted or executed by this assessment, and no model, live-source or external API calls were made. Earlier passing results remain evidence for their original run. Static priority review does not establish current runtime health, branch/mutation coverage, arbitrary model understanding or a guarantee that removing a case is safe.

Temporary reviewer evidence and structural reconciliation are under `/tmp/techvisualized-test-priority/`; the complete case classification is retained in the CSV beside this report.
