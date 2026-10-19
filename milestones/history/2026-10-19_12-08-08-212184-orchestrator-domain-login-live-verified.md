# Custom-domain login live and verified

- Local timestamp / acting role / milestone: 2026-10-19T12:08:08.212184-04:00 / orchestrator / domain password repair.
- Requested scope: restore password login on newly configured flock.techatnyu.org.
- Starting repository state: concurrent model-audit changes remain outside this release; independent source acceptance already recorded.
- Work performed / changed files: added web SITE_ALLOWED_ORIGINS=https://flock.techatnyu.org in Railway; deployed isolated HEAD runtime with only site-auth.js/web.js overlays. Added tests, environment/deployment/server/test guides and sanitized evidence/domain-login receipt.
- Decisions: keep existing PUBLIC_ORIGIN on web and worker to preserve stored attendance provenance; exact custom-domain alias applies to login and authenticated mutations. No password/session-secret changes or source access expansion.
- Checks and evidence: parent67focused checks pass; independent evaluator accepts six-file regression and malformed URL probes.247filepackage compared against HEAD for every runtime file except two intended overlays; no private environment values found. Frontend index and bundle equal previous live release. Railway web fa99fb35-d87d-42d1-9632-c126e10f56d3 SUCCESS. Actual Chrome native Enter login303, authenticated status200, anonymous403, secure/HttpOnly/host-only cookie, foreign logout403, cross-site login403, logout303 and post-logout403 on both domains.
- Resulting state / acceptance: complete live repair. Receipt: evidence/domain-login/hosted-release.json. No model calls, map/source content writes or worker deployments.
- Remaining work and handoff: reload https://flock.techatnyu.org/login and use existing password. Concurrent private model-audit work remains in progress and untouched.
