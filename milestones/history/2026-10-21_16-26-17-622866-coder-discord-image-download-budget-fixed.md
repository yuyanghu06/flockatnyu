# Failed image attempts share download budget

- Local timestamp / role / milestone: 2026-10-21T16:26:17.622866-04:00; coder; Discord image context.
- Requested scope: read Discord message images and inject as chat context.
- Starting state: bounded local implementation; unrelated dirty/concurrent work preserved.
- Work/checks/result: Final implementation charges every consumed chunk against a shared10MiB download budget before signature/stream validation, while preserving successful attachment budgets. Candidate preflight and exhausted-budget omissions prevent repeated failures multiplying downloads.96targeted checks, APIbuild and owned whitespace pass. Only chat-images.js/owned guide changed in this fix. Earlier conditional legacy prompt fix retained. No external side effects.
- Decisions: maintain exact source access/identity/action boundaries and request-local inputs; local acceptance and live activation remain distinct.
- Remaining work/handoff: coordinated web release and authorized hosted verification after external deployment blockers clear.
