# Actual sender cache contract received and service integration planned

- Local timestamp / acting role / milestone: 2026-10-26_17-56-19-933837 / orchestrator / gmail-cache-enrichment.
- Requested scope: separate cache -> Treg -> same cache -> raw Contacts enrichment service.
- Starting state: bounded plan and user-confirmed forthcoming cache; existing services and parallel sender-intake work preserved.
- Work performed/changed files: Actual separate cache builder files appeared: migration049 contacts_cache with exactly id,created_at,raw_input(email,name optional), plus inbox-only sender helper. Root read those files and left them owned by that concurrent task. This resolves sender scope; no To/Cc parsing or Gmail reads belong in the enrichment service. Root added service package commands, disabled env settings and folder guides.
- Checks/evidence: New050 service-only migration assigned separately, preserving049 and deferred048. Enrichment/state under reserved raw_input._treg_enrichment retains original raw fields; private singleton state enforces global lease and UTC-day budget. Fixed RPC adapter + atomic fenced Contacts insertion follow real cache. No hosted apply/deploy authorized or claimed in this pass.
- Decisions: no source email body transmission, no collector/planner/UI rewiring, private logs, raw provider preservation, insert-only existing leads, source/state versions, persisted request IDs and durable budgets.
- Resulting state/acceptance: independent building blocks verified; actual SQL adapter/fencing integration in progress, not complete.
- Remaining work/handoff: finish050 and real adapter, independent SQL/full pipeline tests, build/package and final evaluation. No real token/paid source/database write, schema apply, deployment or activation.
