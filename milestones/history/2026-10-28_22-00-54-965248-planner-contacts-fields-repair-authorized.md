# Contacts fields-only repair plan accepted

- Local timestamp / acting role / milestone: 2026-10-28T22:00:54.965248-04:00 / Planner, serialized by Orchestrator / contacts-read-incident-2026-10-28.
- Requested scope: User explicitly authorized fixing and deploying Contacts list reads using only needed fields while preserving full raw profiles.
- Starting repository state: Isolated worktree from origin/main 5e62ffe, branch codex/contacts-fields-read-fix; original dirty checkout and other work preserved.
- Work performed / changed files: Read-only planner traced all consumers, existing migrations and release boundaries. Accepted additive migration056 for service-only summary search with original ranking/filter/paging order. Separate summary validation and exact full-record write snapshots. Parent records plan and carries only this task's prior diagnosis records.
- Decisions: New function delegates to existing contacts_search WITH ORDINALITY; returns ID/timestamps/six fields only. Existing raw RPC, tables, stored records/timestamps, exact reads, imports and writes stay intact. No frontend or prompt wording change. Deploy only web after reviewed migration.
- Checks and evidence: Prior production diagnosis confirms 291451-byte first-page response versus256000-byte cap; independent list10/list5 failures and sampled exact-read successes. Planner verifies existing behavior predates today's release. New regression, standard CI, browser and final independent review required before release.
- Resulting state / acceptance: Implementation plan accepted; coder and independent tester have exclusive file ownership. No new production change yet.
- Remaining work and handoff: Implement, independently test, review, commit/publish through main release gates, apply reviewed056 and deploy web. Verify real authenticated paging, payload reduction and unchanged stored raw state. Keep other services/settings unchanged; do not force a planner/model/provider cycle.
