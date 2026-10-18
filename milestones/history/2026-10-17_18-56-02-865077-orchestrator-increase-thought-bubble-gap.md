# Increase thought bubble gap

- Local timestamp / acting role / milestone: 2026-10-17T18:56:02.865077-04:00 / orchestrator direct / avatar-redesign.
- Requested scope: increase thought bubble separation from portrait.
- Starting repository state: note body overlapped portrait top by7px.
- Work performed / changed files: src/map-presence.css changes note bottom from calc(100% - 7px) to calc(100% + 16px), increasing separation23px. Map/source guides and tracking updated.
- Decisions: keep note text, tail dots, sizing, positions and camera unchanged.
- Checks and evidence: npm run build PASS, existing chunk warning. User visual testing; no specialists/browser run.
- Resulting state / acceptance: implemented locally; no assets/URLs/data/deployment changes.
- Remaining work and handoff: user checks spacing.
