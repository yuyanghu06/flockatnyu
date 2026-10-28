# Calendar sync location diagnosis and repair evidence

## Diagnosis

The original single approved cycle recorded a partial sync, no failed HTTP
responses and no map-upsert request. Its diagnostic source reason code 34 means
only partial; it does not retain individual unresolved location reasons.

A separate read-only probe read the current Calendar/map data with the earlier
cycle's nine-day window. It reproduced three unknown_location results, all
otherwise unchanged: one known campus building spelled with E-Lab rather than
eLab, and two places outside the fixed building catalogue. It proposed no writes.
This supports the location-matching diagnosis but does not prove that the exact
same three records were the entire original cycle's unresolved set.

The source normalizer treated E-Lab and eLab as different names. It also marked
an unmatched nonempty location as partial even when the event and attendance
were already safely saved without building links. The events contract explicitly
permits events with no mapped building.

## Latest requested behavior

The user first selected an unmapped-location warning, then superseded that choice
with less strict name matching and “just drop the unmapped locations.” Matching
uses only the fixed catalogue and accepts clear spelling, punctuation and spacing
variants. Multiple candidates and uncertain locations remain ambiguous.

Unmatched building links stay empty. Event identity, Calendar originals and
attendance are preserved. A known-to-unmatched move must clear the stale old
building through normal versioned projection; it must not skip the entire event.
An unchanged raw location preserves an existing manual building resolution.
Unmatched locations do not fail the whole sync. Provider/permission/read/write,
incomplete listing and participant-window conflicts remain partial.

## Verification boundary

The diagnostic harness cannot invoke a runner, claim inputs, acquire a lease,
modify tasks or call a model. Its network guard allows only Calendar/profile
reads and the map/building-alias read RPCs. Potential map writes are counted and
suppressed. Credentials stay in subprocess memory; native source bodies are not
saved. The in-memory diagnostic view preserves all relationships and uses a
simplified stored-member proof check, so it is not production authorization or
write evidence.

Independent simulated-provider/in-memory-map checks establish projection,
version and preservation behavior. Actual code changes, final checks, read-only
post-fix results and independent evaluation will be appended below when complete.
No additional production cycle or deployment is part of this pass.

## Implemented correction and completed checks

The matching helper accepts case, accent, punctuation and spacing variants,
including E-Lab/E Lab/eLab. For approximate spelling, both alias and query need
at least five letters. Aliases with 5–11 letters permit one edit; longer aliases
permit two. Adjacent transpositions and bounded spacing edits count. Numeric,
short and generic-only aliases require exact normalized matching. Exact matches
win over overlapping approximate matches; disjoint candidate buildings and
uncertain descriptions remain ambiguous. The catalogue/location bounds and
banded edit calculation bound the work.

The synchronizer no longer adds unknown_location to unresolved outcomes. It
still saves event/attendance facts with empty unmatched building links and
preserves manual placement on unchanged raw locations. Clearing stale links was
already correct before this change and remains covered by exact-version tests.
The existing pure name/time/identity projection moved unchanged into a helper;
formatted modules are 432, 178 and 90 lines.

The final independent baseline contains ten cases: four pass and six expected
capability failures before the fix. Final network-denied verification passes
all ten new cases and 193 existing relevant cases, with no skips and stable
source hashes. Root also passed scoped formatting, ESLint with the current root
configuration, file limits (776 modules/four unchanged frozen exceptions), API
syntax/runtime dependency build and whitespace checks. Existing isolated dev
tooling was reused; no dependencies were installed. No full npm CI, frontend or
browser acceptance is claimed for this server-only change.

The post-fix current-provider diagnostic returns ready/complete, zero unresolved
locations and exactly one intended E-Lab placement correction. Its 57 allowed
HTTP read requests all succeeded. The intended map write was suppressed, not
applied. The two other locations remain unplaced. Its simplified member proof
and snapshot view remain diagnostic limitations; the offline real-service tests
establish permission/version/attendance behavior. This does not retroactively
prove the exact original unresolved set or live storage application.

Final independent evaluator review ACCEPTS the scoped correction and evidence.
Final root hash comparison confirms the verified sources are unchanged. No production cycle, live
business write, model call, deployment, schema/configuration change, commit or
push occurred in this repair pass. The broader 45/54 live coverage is unchanged.

## Final acceptance

The local repair is independently accepted. Clear catalogue name variants match,
unmapped building links are dropped without false partial status, and the
existing event/attendance/manual-placement/version protections remain covered.
The original cycle's partial history and follow-up limit remain unchanged facts.
No corrected placement was written live or deployed; no additional cycle ran.
