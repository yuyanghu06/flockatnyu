# Complete confirmed map roster identities

- Local timestamp / acting role / milestone: 2026-10-17 15:58:51.090487 EDT; orchestrator; map buildings and avatar people.
- Requested scope: apply eleven supplied identity confirmations, audit the original fifteen matches against the configured guild's Eboard role, and retain the explicitly approved senior-advisor exception.
- Starting repository state: hosted migration021 with26avatar people,15linked identities and11pending; many unrelated asset/frontend/backend changes preserved.
- Work performed / changed files: fetched current member profiles and roles, conditionally linked the11confirmed people through the tested store, verified all26final rows and original15links, and refreshed aggregate evidence, database guide, milestone guide and checklist. Private audit material remains outside the repository with0600permissions.
- Decisions: preserve supplied name spellings separately from actual Discord displays; leave surnames unknown when only a handle was supplied. Do not infer physical presence from membership or identities.
- Checks and evidence:26distinct linked Discord IDs;25Eboard members and one user-approved senior-advisor exception; all11confirmation fields verified and original15links preserved. Fresh service RPC returned9buildings with allpresence arrays empty. See evidence/map-people-schema/hosted-roster-confirmations.json. No runtime tests rerun for this data-only pass; prior26local schema/roster tests,5Discord tests and API build remain applicable.
- Resulting state / acceptance: all26identities linked, zero pending. No migration/source changes, deployment or Calendar activation.
- Remaining work and handoff: independently review private confirmation audits; show original15display/username mappings to the user for review. Frontend/agent map wiring remains separate.
