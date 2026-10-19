# README refresh and evidence cleanup prepared

- Local timestamp / acting role / milestone: 2026-10-19T12:44:27.737847-04:00 / orchestrator implementation / repository publication cleanup.
- Requested scope: fix site repository README, ignore evidence while preserving local files, synchronize main from dev, and use renamed repository.
- Starting repository state: codex/dev at b224d46; origin/main at a1fd52c; concurrent Discord transport source/journal changes preserved.
- Work performed / changed files: Updated README.md to describe Flock live services, password gate, live-only source boundaries, active planner/Calendar/map tools and private seven-day audit. Added /evidence/ ignore rule and removed 4073 evidence paths from index without deleting local files. Updated origin to user-provided https://github.com/yuyanghu06/flockatnyu.git. Main was verified a strict ancestor of dev by73 commits; user clarified main should receive dev. Concurrent Discord implementation remains unstaged.
- Decisions: normal fast-forward publication only; no reset, force push, history purge, branch switch or deployment.
- Checks and evidence: 23 relative README links and8 documented npm scripts validated; selected whitespace clean; preservation manifest confirms all4073 original local files remain. Branch push awaits independent review. No model/source/API/deployment calls.
- Resulting state / acceptance: bounded pass recorded; publication outcome follows in a separate entry.
- Remaining work and handoff: final independent acceptance, commit only owned changes and update both remote branches; leave ongoing Discord work untouched.
