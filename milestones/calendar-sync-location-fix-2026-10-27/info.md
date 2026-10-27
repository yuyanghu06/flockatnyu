# Calendar-to-map location matching repair

Goal: explain the partial result from the one approved worker cycle and fix its
location handling without another production cycle. Existing source evidence
shows no HTTP failures. A read-only probe of current Calendar/map state using
the earlier window reproduces three unknown locations and no potential writes.
It is diagnostic evidence, not a replay of the historical cycle or a real write.

The user requested less strict name matching and then said to drop unmapped
locations. Preserve Calendar events, saved activity identity and attendance;
leave unmatched building links empty. Unmapped locations do not make the entire
sync partial. Preserve manually resolved links when the raw location has not
changed. Ambiguous matches and real read/write/permission/conflict failures stay
partial. No catalogue expansion or guessed building is authorized.

Accepted implementation plan: coder owns sync/location helper modules; the
independent tester owns tests/calendar-sync-locations.test.mjs. Root alone
updates shared journals.

Scope: deterministic alias matching, map placement result reporting, focused
in-memory behavior checks and read-only provider verification. No production
cycle, model calls, queue/lease/task mutations, schema/configuration change or
deployment. Root serializes journal writes; specialists own assigned code/tests.

Completion requires independent reproduction, preservation checks, standard
scoped checks and evaluator acceptance. Live application of projected changes
remains unverified until a separately authorized future cycle/release.

Implemented and independently tested: 203/203 checks, scoped quality/API build
pass and a ready read-only provider calculation with one suppressed E-Lab
placement correction. Final evaluator review ACCEPTS the scoped correction. The local milestone is
complete; no deployment or live placement application is claimed. No live write or cycle
occurred; see [verification](verification.md) for the exact boundary.
