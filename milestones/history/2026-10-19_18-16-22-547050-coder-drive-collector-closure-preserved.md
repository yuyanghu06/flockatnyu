# Collector import boundaries preserved

- Local timestamp / acting role / milestone: 2026-10-19_18-16-22-547050 / coder / Drive search repair.
- Requested scope: resolve the parent integration finding without broadening collector package access.
- Starting state: opaque cursor behavior passed focused/native/live checks, but two collector packaging tests rejected the new helper dependency.
- Work performed: moved shared cursor constants/predicate into existing pure server/automation/validation.js; removed the separate tools helper and updated the three consumer imports and affected guides. Collector packagers and their expected closure lists are unchanged.
- Decisions: reuse the validation module already reachable in both collector closures; preserve strict regex restrictions except for the exact bounded cursor assertion.
- Checks and evidence: coder ran collector-deploy, google-connector and chat-drive suites: 39 passed, zero failed. Both actual Gmail and Discord closures pass. Diff check passes; obsolete helper imports absent.
- Resulting state: corrected implementation frozen. Parent final affected checks and independent evaluator verification underway; refreshed guarded packages being prepared.
- Remaining work: accept final verification, deploy web/update-agent and verify hosted failed query plus continuation before publication.
