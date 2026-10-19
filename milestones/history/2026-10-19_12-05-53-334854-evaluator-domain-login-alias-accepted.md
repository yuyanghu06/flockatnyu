# Custom-domain login alias accepted

- Local timestamp / acting role / milestone: 2026-10-19T12:05:53.334854-04:00 / independent evaluator integrated by orchestrator / custom-domain access repair.
- Requested scope: diagnose password rejection on newly attached domain and repair exact authorized login origin.
- Starting state: concurrent private model-audit changes remain uncommitted and outside this release. Production canonical PUBLIC_ORIGIN is Railway hostname; flock.techatnyu.org bound but rejected before password validation.
- Work performed / changed files: site-auth.js adds bounded exact SITE_ALLOWED_ORIGINS; web.js uses same gate for login. Tests, environment example, deployment/server guides updated. Preserve PUBLIC_ORIGIN for stored attendance references and worker compatibility.
- Decisions: web-only alias https://flock.techatnyu.org, no source permissions or password changes. Cookies stay host-only. Initial parser normalization issue fixed with strict raw canonical comparison.
- Checks and evidence: parent67/67 auth/security/source/attendance tests passed; independent evaluator six-file regression exited0, six malformed URL probes reject, scoped whitespace passed. Production invalid-password diagnostic: custom host403 plain Access denied versus canonical403 credential rejection.
- Resulting state / acceptance: independent source ACCEPT; isolated HEAD runtime plus two auth file overlays being packaged.
- Remaining work and handoff: deploy sanitized web only; verify live login/protected reads, foreign denial and logout. No live repair claimed yet.
