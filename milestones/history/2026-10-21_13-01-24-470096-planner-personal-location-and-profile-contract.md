# Profile and personal-location contract

- Local timestamp / acting role / milestone: 2026-10-21T13:01:24.470253-04:00 / independent planner / avatar-assets and personal-location verification.
- Requested scope: add a matching avatar/profile, check source-backed personal-location creation, save future map time selector only.
- Starting repository state: unrelated chat/collector/reliability edits in progress; preserve them.
- Work / files: independent planner inspected map identity/schema, avatar resolution, shared record rules, chat and update-agent adapters; no edits or external writes. Root inspected actual source and executed minimal exact Discord username lookup and guarded profile insertion separately.
- Decisions: use established bundled avatar path; no new remote-image/storage mechanism. Exact provider identity, source evidence and fixed-building catalogue remain required. Informal personal activities are normalized map events, not Calendar events. Bare website first-person chat remains unverified. A hypothetical feature suggestion is not a current presence statement.
- Checks and evidence: planner local Node probe confirms bare first-person location does not request generic chat mutation; safeAvatar rejects HTTPS and frontend requires bundled image. Existing tests inspected, not run in this planner pass.
- Acceptance: contract accepted; parent completed profile/artwork work and assigned bounded prompt clarification and independent synthetic behavior checks.
- Limitations / handoff: live frontend needs a build/deployment for the new bundled image. No real presence/event was created from the screenshot. Future time selector is notes-only.
