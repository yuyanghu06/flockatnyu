# M20 corrected retention storage coder pass

- Milestone / role / scope: M20 coder; adapt the unapplied summary migration and server adapter to verified weekly/monthly compaction. No daily summary jobs, cloud writes, credentials, model calls, deployments, or child agents.
- Starting state: read project instructions, milestones/to-do, coder configuration, assignment/report templates, the final retention planner brief, applied migrations001–005, prior summary implementation, runner contracts and independent tests. Applied migrations remain immutable. The earlier storage report describes the superseded indefinite-original-retention design.
- Changed files: `supabase/migrations/202610120006_discord_memory_summaries.sql`, `server/discord/summary-store.js`, and this report only. Other agents' implementation, tests and shared journals are preserved.

## Implemented behavior

Eleven service-only forced-RLS tables now distinguish temporary processing inputs
from immutable certificates, final summary content, active compaction ranges and
minimal operation/request accounting. Jobs have only weekly/monthly tiers and do
not reference raw bucket UUIDs. Raw inputs and verified prior summaries have
separate identities, represented-original counts, source-bound citation IDs,
ordered fingerprints and server-derived8,000-codepoint segments. Canonical raw
evidence includes retained embed/component text and sorted retained text links.
Verified child input contains the certified summary and provenance, never a copy
of deleted originals.

Bootstrap selects historical months directly as monthly jobs, then eligible
current-month weekly ranges. Weekly ranges use New York Mondays clipped to the
month and exact elapsed168-hour cutoff. Prefix extensions consume a certified
prior prefix plus disjoint newly eligible raw. Monthly closes the whole previous
calendar month, including recent raw and prior weekly output. Calendar scheduling
and the08:00 gate belong to the coordinated runner.

Preview/begin require complete source checkpoints, including eligible empty sources
that have not yet been scanned. A group also requires configured history coverage
through its complete range. Any waiting source prevents operation creation and
returns `wait_for_sync`; missing content cannot be reported as completed history.
Pending lookup excludes stale, closed, old-weekly and disabled/inactive sources.

Publication locks policy, discovery, memory and source consistently with existing
persistence. It rechecks current revision, expiring lease, enabled/active exact
source identity, current ancestry policy, canonical input/dependency fingerprints,
disjoint ranges, complete segment coverage and the entire map/reduce DAG. Citation
URLs are derived from trusted guild/channel/message identities. The same transaction
publishes the certificate/result, supersedes consumed ledger ranges, deletes only
verified consumed originals and their revisions, repairs affected raw bucket counts,
removes consumed weekly summary content and temporary processing content, and clears
unfinished overlapping manifests, including an older stale monthly fingerprint.
Any error rolls publication and deletion back together.

Closed summaries and grants remain valid after raw pruning. Same-token terminal
retry returns the certified result without reopening raw inputs, another model
request or deletion. A superseded prior weekly certificate retains only minimal
lineage metadata. The active ledger enforces half-open nonoverlap per source;
certificate references use composite source boundaries.

The replacement `discord_persist_page` preserves its existing boolean signature.
It validates supplied and known immutable message identity before skipping already
compacted timestamps under the shared source lock. Even an entirely skipped page
advances its scanned checkpoint atomically. No existing collector/store changes
are required, and a new source without a ledger collects old history normally.
Scoped paused reset deletes only the target guild's raw/summary/ledger/temp/usage
data while retaining policies, operators, source ACLs and unrelated guilds.

Existing request accounting remains conservative and durable: dispatch requires a
unique reservation under the operation's request/$5 limit, unknown attempts remain
charged, cached-only completion is allowed at exact caps, and routine budget/runtime
pauses do not consume terminal-failure retries. Preview/begin/finish alone receive
function-local60-second/16MB settings and65-second HTTP deadlines. No global or
role timeout, permissions, grants, embeddings, images or model behavior is changed.

## Executed checks

- `node --check server/discord/summary-store.js`: passed.
- Genuine PGlite plus pgvector applied all six migrations. A coder-run SQL lifecycle
  passed weekly2-raw publication, prefix extension with1raw+1verified input,
  then monthly closure with2raw+1verified input representing all5 originals.
  Exact raw prune counts were2/1/2; only one final monthly result/active range
  survived. Temporary inputs/parts/coverage and consumed weekly content were gone.
  Same-token retries, post-prune explicitly granted reads and late-page boolean
  persistence with checkpoint advance and zero recreated raw records passed.
- `node --test tests/discord-summary-sql.test.mjs`:11/11 passed in2.1seconds
  after independent fixture qualification of an ambiguous certificate/ledger
  SELECT. This includes forced-RLS/invoker/browser denial, bootstrap selection,
  incomplete/refused/stale/pause/blacklist/disabled-source rollback, Unicode/control
  reconstruction, complete processing, exact prefix/mixed-month counts, an injected
  after-delete rollback, post-prune cache/read, no resurrection, incomplete new
  sources and scoped reset.
- Final focused command `node --test --test-name-pattern='genuine006|stale monthly|exact durable' tests/discord-summary-sql.test.mjs`:14/14 passed in5.8seconds, including staged/missing/old-revision discovery waits, obsolete monthly-fingerprint content cleanup, more than ten one-request resumptions and cached-only finalization at exact operation caps. Representative scale verification is owned by the independent tester; an initial coder full run stopped before summary planning on a subsequently corrected fixture count alias.
- Captured scale plans: `retention-scale-before-fix-explain.txt` preserves the
  repeated inner aggregate; `retention-scale-explain.txt` shows the grouped
  materialized CTE and final CTE Scan. Independent tester commands and exact
  accepted timings belong to its final evidence report.
- `node --test tests/discord-summary-provider.test.mjs tests/discord-summaries.test.mjs tests/discord-summary-schedule.test.mjs`:51/51 passed. These are synthetic provider tests; no live model requests were made.

## Findings, limits and handoff

Evaluator findings addressed before handoff: eligible empty-source readiness,
source enabled/active rechecks under row shares, known immutable identity before
compacted skip, and cleanup of obsolete monthly temporary processing content.
Independent scale testing exposed a real planning failure on fresh statistics.
The captured internal manifest plan estimated one eligible source and placed the
canonical/digest/JSON GroupAggregate inside the final nested-loop readiness join;
216 actual sources caused repeated expensive aggregation. The fix materializes
the grouped manifest once before that join. No period, fingerprint, guard or timeout
semantics changed. The tester preserves the pre-fix EXPLAIN and is rerunning the
same representative archive to verify the corrected plan and per-RPC timings.
The corrected independent run measured preview8.9seconds, begin10.5seconds and
repeat begin9.2seconds over108,836 originals/216 sources/779 raw groups. It selects
695 retention jobs representing106,961 eligible originals. Its6,397-original
publication reached72 valid map parts but correctly refused a runner reduction
with more than64 child references; that failed transaction pruned zero raw.
The orchestrator owns the matching runner packing fix and final publication retest.
Incomplete/staged/wrong-revision discovery also blocks planning before any group
scan, so a temporarily empty scope cannot claim completed history. Independent
tester/evaluator own final acceptance. The unapplied006 may be applied
only by the orchestrator after review; actual hosted preview/begin/finish timing
and a bounded real-model pilot are still required before any real pruning claim.
Local PGlite timings do not establish Supabase performance.

Pruned original text cannot be reread locally, regenerated under a different model,
or edited from a historical late collector page. Surviving summary citations still
link to Discord. Any deliberate recovery/reprocessing must explicitly recollect
source history and reset its relevant retention state; routine collection never
resurrects it. The summary model reads prior weekly summaries as represented evidence,
not their deleted raw messages.

Folder-guide changes belong to the orchestrator: update Discord/Supabase/evidence
guides to distinguish recent raw, weekly prefixes, closed monthly content, processing
input counts versus represented originals, and verified atomic deletion. Journal
this pass and supersede the earlier indefinite-retention report. Continue with
independent lifecycle/scale review, hosted function-budget proof, then the authorized
bounded Luna pilot and physical before/after row counts.

Coder handoff verdict: assigned storage behavior is implemented and locally
verified; final milestone acceptance remains pending the independent largest-group
publication retest and evaluator. No live retention result is claimed. The files
are stable for integration; reactivate the coder for a concrete storage finding.
