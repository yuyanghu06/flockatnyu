# Private loop stop after cycle

- Local timestamp / role / milestone: 2026-10-26T16:53:19.906505-04:00; coder; manual pending work.
- Scope / work / evidence: Added a private content-free stop marker command for newly loaded loops only. Checks occur between cycles, never aborting active work or changing budgets/leases. Seventeen offline mock/CLI groups passed. Existing process 28343 retains its old imported module and cannot use this feature. No marker activated and no production files or live state changed.
- Result / next action: continue normal owned claims and exact verified completion; preserve unresolved work and private credentials.
