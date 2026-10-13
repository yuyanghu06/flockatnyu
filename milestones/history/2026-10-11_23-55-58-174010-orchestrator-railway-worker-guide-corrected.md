# Railway worker guide corrected

- Local timestamp / acting role / milestone: 2026-10-11_23-55-58-174010 / orchestrator / M20.
- Requested scope: finish the authorized Discord RAG retention rollout and report actual state.
- Starting repository state: substantial existing backend and unrelated frontend work; the original cloud bootstrap remains active.
- Work performed / changed files: refreshed deployment/discord-worker/info.md in plain English; corrected the rolling milestone's current context and executable max-runs argument spacing; updated the to-do list.
- Decisions: keep the existing deployment, operation identity, caps and calendar schedule. Refresh calendar retention after Monday midnight before terminal acceptance.
- Checks and evidence: read current CLI argument parser and scheduler; live count-only query showed 399 summary results, 76,952 represented originals, 31,884 raw including 1,769 frozen protected rows, 1,510 requests and $2.9186126 estimated cost. Four requests/jobs are in flight.
- Resulting state / acceptance: documentation corrections accepted. Historical bootstrap and final collector/retention audit remain incomplete. No cloud mutations or model dispatches were initiated by this documentation pass.
- Remaining work and handoff: finish the bootstrap; update the collector, refresh the current week if necessary, then obtain independent terminal storage and permission checks.
