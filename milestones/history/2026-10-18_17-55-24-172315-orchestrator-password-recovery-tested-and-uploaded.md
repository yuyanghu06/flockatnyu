# Password startup recovery tested and uploaded

- Local timestamp / acting role / milestone: 2026-10-18T17:55:24.172315-04:00 / orchestrator integrating coder and independent reviewer reports / live recovery.
- Requested scope: repair latest failed web deployment without changing user environment password or publishing unfinished local UI.
- Starting repository state: latest web built but crashed because old minimum24 rejected configured14character password; source auth signing/origin configuration otherwise valid.
- Work performed / changed files: server/site-auth.js changes only password minimum24→12. Added production boundary regression in tests/site-auth.test.mjs while preserving parallel icon/UI changes. Root refreshed .env.example, docs/deployment.md and deployment/web/info.md. Copied only server/site-auth.js into a new context based on the preceding240file sanitized stable web package; all other file hashes unchanged. Uploaded recovery release to Railway.
- Decisions: retain private configured password and>=32signingsecret; no session/origin/source-grant changes. Unpublished local server/web.js UI excluded from recovery image.
- Checks and evidence: coder29/29 auth/security/packaging/volume tests; independent reviewer11/11 auth+runtime and14/14 security plus explicit12/14acceptance,11/empty/overlongrejection. Secure signed strictcookies/nonadmin access preserved. Context diff is exactly one runtime file; scoped whitespace passes. No secrets/source/model calls.
- Resulting state / acceptance: source fix independently accepted; cloud build/startup/login verification pending.
- Remaining work and handoff: verify recovery release SUCCESS and authenticated native HTTP flow; confirm real worker completion after its Miro broker becomes available. Collector same-generation continuation fix proceeds separately.
