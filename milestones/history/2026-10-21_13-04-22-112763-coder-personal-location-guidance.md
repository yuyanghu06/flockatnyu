# Source-backed personal-location guidance

- Local timestamp / acting role / milestone: 2026-10-21T13:04:22.112763-04:00 / coder / personal-location-behavior.
- Requested scope: ensure original personal-location statements can create a missing informal normalized activity and display linked participant at matched building during its supported window.
- Starting state: tools already support source-bound read/lookup/upsert; no bare website self-identity or arbitrary profile editing.
- Work / files: clarified server/map/contracts.js and server/assistant-context.js; updated docs/events.md, server/map/info.md and tools/map/info.md. Preserve unrelated work.
- Decisions: fixed building and exact original linked author first; read stable source identity, create absent event without invented UUID or update same event with fresh optimistic token. Informal activity stays map-only. Current reports use reported basis; unqualified same-day until-only availability uses personal_plan/planned from original report timestamp to explicit same-day end, with end strictly later and no next-day guessing. Explicit future/delayed arrival without supported start remains uncertain. Hypothetical feature examples are not activity evidence. No intent or identity gate changes.
- Checks/evidence: coder55focused chat/update-map/prompt tests and10map-contract tests pass; API build and whitespace checks pass. Final automation prompt24486bytes below24576byte cap. Root inspected actual resulting diff.
- Acceptance: implementation frozen for independent synthetic behavior/model verification and evaluator review. No hosted behavior activation claimed.
- Remaining work / handoff: independent checks and journal integration pending; frontend avatar/guidance require coordinated deployment. No real source event or Calendar write performed.
