# Mixed Miro item coverage plan

- Local timestamp / acting role / milestone: 2026-10-17_13-33-27-259063; planner miro_connection_plan; M27 activation.
- Requested scope: bounded fix needed for actual schedule board connection.
- Starting repository state: read-only authorization/token provisioned privately; preflight ready1/1; first complete snapshot running; local API restarted with preserved source allowlist plus generated Miro source. Existing unsupported table makes items page fail as unsupported_content.
- Work performed / changed files: read-only tools/client/snapshot/test review and plan; no specialist edits. Root staged exact board/team/token on existing Railway worker without deploy, keeping sync false.
- Decisions: preserve listing metadata/order for unknown items without detail probing; hydrate supported types, expose explicit metadata-only coverage and partial status. Unsupported per-item reads disclose absence after source authorization. Supported access failures still fail closed. No table cell claim, no client/snapshot/schema scope change.
- Checks and evidence: real first list total2495,6frames/3texts/1table; generic table detail returns metadata and no data/cells. Official Miro REST introduction lists tables unsupported. Live catalogue/overview/tag reads ready; mixed items initially unsupported. Worker currently SUCCESS/stopped, cron configuration historical until fresh readback.
- Resulting state / acceptance: bounded plan accepted; coder exclusively owns server/miro-tools.js and new tests/miro-unsupported-items.test.mjs. Root owns documentation/configuration. User-approved persistent read scope unchanged.
- Remaining work and handoff: inspect coder result, independent review/retests, refresh API and verify live mixed pages; finish snapshot, then hosted daily activation. No connection completion claim yet.
