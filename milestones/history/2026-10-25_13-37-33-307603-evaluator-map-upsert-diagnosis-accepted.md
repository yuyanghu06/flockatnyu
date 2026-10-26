# Map upsert failure and recovery independently accepted

- Local timestamp / acting role / milestone: 2026-10-25T13:37:33.307603-04:00 / evaluator / map-upsert-diagnosis-2026-10-25.
- Requested scope: independently evaluate the bounded incident diagnosis; read-only.
- Starting repository state: existing changes preserved; parent collected Railway metadata, retained proposals and live database readback.
- Work performed / changed files: read ignored incident evidence and current/frozen deployed time validator and chat adapter; no edits or external requests.
- Decisions: first call's duplicate raw/local boundary representation is rejected even when both represent the same instant; cancellation is a separate observed state with unproven cause.
- Checks and evidence: offline Node assertions confirm both requests pass argument schema; first raises map_time_conflicting_boundaries; second removes only the two local event fields and passes time normalization. Current two runtime files are byte-identical to frozen web release. Railway run83e6c5f8-1d1f-4bfc-adaa-81628690f923 round10 rejects at17:32:44.417Z and round11 succeeds at17:32:50.065Z onOctober25.
- Resulting state / acceptance: ACCEPT cause and recovery. Live participant/status readback is parent evidence, not an independent database request.
- Remaining work and handoff: journal and report; no code fix or deployment performed. Cancellation attribution remains unverified.
