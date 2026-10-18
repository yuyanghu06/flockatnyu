# Persistent single OAuth owner, worker token broker and bounded FIFO

- Local timestamp / acting role / milestone: 2026-10-18_15-42-35-807359 / coder / pre-deployment optimization
- Requested scope: Persistent single OAuth owner, worker token broker and bounded FIFO.
- Starting repository state: authorized dirty integration tree, existing live collectors; website/agent launch pending.
- Work performed / changed files: see current implementation and cited evidence; parent integrates shared documentation.
- Decisions: preserve source permissions and exact evidence; credentials private.
- Checks and evidence: Broker only returns access token, persists rotating credentials, deduplicates refresh, official upstream only. Queue64waiting, prompt cancellation and FIFO. Expanded146/146 plus foreign discovery regression passed. Deployment volume bootstrap added; final checks/review pending.
- Resulting state / acceptance: pass accepted within stated fixture/browser scope.
- Remaining work and handoff: finish launch checks, deploy, verify live updates, logical commits and push.
