# Persistent password sessions implemented

- Local timestamp / acting role / milestone: 2026-10-19T13:03:27.891335-04:00 / coder / persistent website auth.
- Requested scope: remember password-authenticated browsers across restarts; conventional30day lifetime selected by orchestrator.
- Starting repository state: ongoing separate Discord ping-only rollout; preserve all concurrent changes.
- Work performed / changed files: Coder owns server/site-auth.js and two focused tests. Default and maximum become2592000seconds; shorter300secondminimum preserved; explicit Expires matches signed token and Max-Age. Logout clears both. Existing cookie/security/access protections remain.
- Decisions: keep shared nonadmin auth and source scope; no new identity/storage/provider capabilities.
- Checks and evidence: Required3fileauth/password/securitysuite30/30PASS, syntax and whitespace clean. Initial2staleTTLassertions were corrected within assigned ownership.
- Resulting state / acceptance: local30daypersistence accepted, deployment next.
- Remaining work and handoff: deploy auth-only overlay, verify actual cookie/login/protected/logout, then publish source and final receipt.
