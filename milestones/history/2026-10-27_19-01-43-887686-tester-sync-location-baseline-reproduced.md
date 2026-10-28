# Independent offline baseline reproduces location failures

- Local timestamp / acting role / milestone: 2026-10-27T19:01:43.887686-04:00 / tester / calendar-sync-location-fix-2026-10-27.
- Requested scope: reproduce location matching and partial-sync behavior before correction without a production cycle or live business writes.
- Starting repository state: pre-edit 175-line sync source captured independently; current unrelated work preserved.
- Work performed / changed files: Tester created tests/calendar-sync-locations.test.mjs with a real map service, simulated provider and version-checked in-memory store. Captured old-source output at ignored evidence/calendar-sync-partial-2026-10-27/tester-before.tap. Root inspected that output.
- Decisions: Test saved business outcomes rather than prompt wording or implementation details. Canonical eLab spelling collisions must remain ambiguous. Approximate matching requires at least five normalized letters in both query and alias; shorter names need exact normalized matching.
- Checks and evidence: Old source run, network denied: four passes and five expected failures. Failures cover E-Lab recognition, resulting projection partial, new unmatched location, known-to-unmatched move status and eLab/E-Lab canonical-alias collision. Existing manual placement/attendance, ambiguity and real failure checks passed.
- Resulting state / acceptance: Regression baseline establishes the requested changed behavior; no corrected-source acceptance claimed yet. No external/model/cycle call or live mutation occurred.
- Remaining work and handoff: Coder implements owned sync/helper files; tester reruns the suite and relevant existing cases. Root runs scoped quality/build checks, read-only post-fix probe and independent evaluation.
