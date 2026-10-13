# M20 corrected retention implementation brief

Read-only planner reviewed the actual unapplied006, modules, existing persistence
locks, tests and state. No edits, cloud/credential/model calls or children.
Root serializes the report; user explicitly supersedes indefinite raw retention.

## Retention and time contract

No daily summaries. Recent current-month messages remain raw. Mondays at08:00
America/New_York compact current-month raw strictly older than asOf minus168h
into source-specific Monday-week summaries. Clip each week to the current month
and eligible cutoff. An existing verified weekly prefix plus disjoint newly
eligible raw extends that week's summary; replace the prefix atomically.
Seven days is a minimum raw lifetime between Mondays, not an exact moving
partition. Eligible raw may wait until the next Monday, up to about14days.

On the1st at08:00 New York close the whole previous calendar month, including
any recent raw records and verified weekly prefixes. This closed-month rule
explicitly overrides the prior cross-month rolling-seven-day precedence.
Monthly consumes weekly summaries plus remaining raw, replacing both with only
monthly summary content. On Monday the1st, monthly closure precedes current-month
weekly work. Initial manual bootstrap directly creates monthly summaries for all
old calendar months, then weekly eligible current-month records; never first
create historical daily/weekly summaries. Choose08:00 as a routine morning time.

## Schema and lifecycle

Adapt UNAPPLIED006 and new modules; preserve applied001–005. No new007 unless006
is applied before correction. Jobs/input records distinguish raw from verified
summary inputs, explicit half-open ranges, processed record counts and represented
original counts. Final results have no raw-row dependency after verified prune.
A per-source compaction ledger holds nonoverlapping range, tier, surviving result
identity/hash, represented-original count, coverage digest and close time.
Weekly extensions and monthly replacement supersede consumed ranges atomically.

Keep final summary JSON, canonical cited IDs/Discord URLs, aggregate coverage
counts/digests, minimal lineage, model/prompt provenance and usage accounting.
Delete consumed raw/revisions, temporary canonical inputs/coverage/map-reduce
content and redundant weekly summary content. Do not keep a second full archive.
Incomplete/failed generation retains all source records and old summaries.

## Atomic finish and guards

FinishJob acquires policy then existing memory/source locks consistent with page
persistence. Verify current lease/revision/source eligibility and unchanged raw
and summary dependency fingerprints. Verify exact input-segment coverage and all
map ancestors; child certificates must be committed and ranges disjoint. Distinguish
raw originals directly read from originals represented through prior summaries.
Publish result/certificate, update ledger and prune ONLY those verified consumed
records in the same transaction. Any failure rolls all of it back. Successful
retry returns the surviving committed result without another model call/delete.
Do not let the original-change trigger invalidate the newly committed result.

Replace persist_page in006 to validate incoming identity, acquire the same source
lock, skip covered compacted ranges and commit scanned checkpoints atomically.
Old backfills, overlap and late pages must not resurrect deleted records. Expose
skipped counts without breaking existing store/sync return contracts; coordinate
root before changes outside exclusive ownership. A new source has no ledger and
collects history normally, then direct monthly bootstrap. Raw group rebuilds are
independent of retained summaries and must not erase them.

Read summaries through committed certificates/current policy/source eligibility,
explicit member grants and trusted source scope. No browser writes/auto grants.
Reset only target guild ledger/summary/temp/raw; preserve config/operator/ACL and
unrelated data. Preserve images/vector exclusions. Keep existing durable request,
unknown-charge, cost/retry/concurrency and lease guards.

## Runner and scheduling

Agree mixed-input identity/segmentation/allowed-original-citation contracts between
storage and runner. Read every raw or verified-summary input; inherited citations
remain canonical Discord links even after local originals are gone. Monthly
represented-original counts/digest include child certificates plus new raw, and
must not claim that the monthly model reread deleted originals. Cached compacted
results stay valid without current-raw hashes or raw bucket UUIDs.

Separate bootstrap/manual weekly/manual monthly/scheduled modes. Schedule two UTC
slots12:00/13:00, gate08:00 New York to handle DST; other slot generates nothing.
Use durable due-period identity/idempotence and explicitly resume pending work.
Daily collector schedule stays06:15UTC and model outages cannot stop collection.

## Exclusive ownership and acceptance

Storage:006, summary-store and retention storage report. Runner: summary-config,
summaries, summary-cli, new summary-schedule and runner report. Tester: assigned
SQL/runner/schedule fixtures/evidence. Root: package/env/deployment/guides/journal,
provider fixes and all live rollout. No specialists spawn children or change cloud.

Prove post-prune reads/cache; no consumed raw/revisions/temp/weekly content left;
monthly mixed lineage/count/disjoint ranges; refusal/stale/missing coverage leaves
old data intact; rollback, no-repeat retry, no resurrection/late-page race; source,
guild/ACL/blacklist/reset isolation; no daily calls; direct monthly bootstrap;
weekly prefix extension; Monday1st/DST/durable due identity; zero images/vectors.
Check representative108828+ archive scale, then actual hosted60/65s operations and
real pilot before full generation/pruning. Physical row/content counts before and
after establish reduced storage; local fixtures do not prove live outcomes.

After compaction, local verbatim history, full edit reconciliation and regeneration
from original text are unavailable. Newly accessible historical messages within an
already compacted source range need explicit recovery; do not auto-resurrect.
