# Exact authentication regression expectations corrected

- Local timestamp / acting role / milestone: 2026-10-22T18:01:07.284810-04:00 / tester, serialized by orchestrator / manual-planner-start.
- Requested scope: queued-only forced standard cycle, optional exact-channel blacklist override, normal lease/source/runtime controls.
- Starting repository state: implemented components, independent130checks, operator HTTP wiring and guides ready; concurrent accepted work preserved.
- Work performed / changed files: Updated only two tests/site-auth.test.mjs expected principal objects for server-owned plannerControl:true; retained nonadmin/providerflag/forgery/security assertions. No runtime edits.
- Decisions: retain one bounded configured batch and ephemeral whitelist; no history import or source publication.
- Checks and evidence: Independent34/34site-auth/manual-route/site-security checks and assigned whitespace pass. Initial broad2441pass/2stale expectationfail/1skip; final broad2443pass/0fail/1optional skip after this correction, explicitly excluding separate personal-location-behavior.test.mjs with two legacy chat-gate expectations.
- Resulting state / acceptance: local/package/schema gates accepted; actual deployed route/worker outcome is recorded separately.
- Remaining work and handoff: deploy exact reviewed packages, verify health/auth and an empty selected queue without creating model/business test facts. No Git publication by this pass.
