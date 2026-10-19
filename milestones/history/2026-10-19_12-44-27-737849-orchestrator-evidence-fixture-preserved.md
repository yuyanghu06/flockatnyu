# Required test fixture preserved outside local evidence

- Local timestamp / acting role / milestone: 2026-10-19T12:44:27.737849-04:00 / orchestrator fix and targeted verification / repository publication cleanup.
- Requested scope: fix site repository README, ignore evidence while preserving local files, synchronize main from dev, and use renamed repository.
- Starting repository state: codex/dev at b224d46; origin/main at a1fd52c; concurrent Discord transport source/journal changes preserved.
- Work performed / changed files: Copied inert signal-preload fixture byte-for-byte to tests/fixtures/discord-cli-signal-preload.mjs, updated tests/discord-launch.test.mjs import and tests/fixtures/info.md. README explains historical comparison/profile scripts require local baselines. Original evidence files remain intact. Required fixture is test source, not generated evidence.
- Decisions: normal fast-forward publication only; no reset, force push, history purge, branch switch or deployment.
- Checks and evidence: node --test tests/discord-launch.test.mjs:18/18PASS including real child SIGTERM. Fixture byte identity, links/scripts, staged scope and cached whitespace checks passed. Full build/suite not rerun for documentation and fixture relocation; independent correction review pending.
- Resulting state / acceptance: bounded pass recorded; publication outcome follows in a separate entry.
- Remaining work and handoff: final independent acceptance, commit only owned changes and update both remote branches; leave ongoing Discord work untouched.
