# Drive skill release started

- Role: orchestrator; user-authorized skill integration under existing live rollout authorization.
- Starting state: coder/tester/evaluator local acceptance, source d27d980 pushed to codex/dev.
- Work: full1485test run passed1484 and exposed an old HTTP tool-count assertion (eight vs new nine); corrected that expectation and explicitly required list_drive_folder. Focused7/7 passed; test-only af38a51 pushed; finalfull run underway.
- Release guard: sanitized web259files/worker54files exactly match reviewed current runtime; both contain skill SHA2560f9f1a963bf117d3ceaae079f6767631e999e588acf0dc908b3ade021460d69d. Private-value scan passed. Local configured OAuth/root read returned30entries without cursor, metadata only.
- Deployment: web8fe2f730-dad6-4bc3-8f76-2d8d550c6600 and update-agentcee0928f-429a-477e-b2ce-2d5db95cddaf BUILDING through authenticated Railway CLI. The separate MCP client reported expired authorization; CLI access was already valid. No new settings, schema or source writes. Existing normal-ping and persistent-auth runtime preserved in packages.
- Acceptance: rollout started, not yet live verified. No real model canary invoked.
- Handoff: await success, verify exact remote hashes and hosted read-only Drive/root access, capture aggregate receipts and final full-suite result.
