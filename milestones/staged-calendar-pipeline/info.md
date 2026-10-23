# Staged Calendar pipeline

Goal: reduce model-driven synchronization while preserving interpretation and source access. One existing eligible queue trigger runs initial Calendar updates, deterministic club/Member Plans Calendar-to-map projection, then up to10 follow-up model turns with full eligible task manifests and actual execution results. Personal/current-presence activities always originate in Member Plans; RSVP participation stays on the existing club occurrence.

Scope: pinned Calendar clients and validated signed person metadata; collision-safe fixed building/alias matching; normalized event relation preservation; temporary service-only UUID/JSON task cache with timestamp/version/lease fencing; bounded run-local execution history; worker and web source visibility wiring. No source archives, audit retrieval, invitations, Miro writes, new profiles/buildings or map geometry edits.

Completion: independent meaningful SQL/runtime/flow tests, regression suites/builds, source/evaluator review, reviewed forward migrations and sanitized live deployment with actual read/access verification. Historical map-only records are preserved; no wholesale data migration.

Status: implemented, independently tested/reviewed and deployed. Hosted schema/configuration/readiness and actual task/final-phase progression are verified; first organic settlement was still in progress at the final release receipt. Parent owns shared guides/journal. Runtime truth, limits and release receipts remain in ../milestone.md.
