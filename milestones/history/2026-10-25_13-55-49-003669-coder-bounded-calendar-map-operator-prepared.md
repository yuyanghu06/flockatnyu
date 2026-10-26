# Bounded active Calendar map operator prepared

- Local timestamp / acting role / milestone: 2026-10-25T13:55:49.003669-04:00 / coder / map-calendar-relink-2026-10-25.
- Requested scope: prepare only an ignored exact-record operator script for the user-requested active Calendar correction; do not execute live writes.
- Starting repository state: unrelated runtime/schema/documentation work preserved; owned only evidence/map-calendar-relink-2026-10-25/relink.mjs.
- Work performed / changed files: created the ignored script with read-only default and explicit --apply for one optimistic normal-service upsert. No tracked runtime files changed.
- Decisions: reuse active target; preserve three existing attendees and all target event fields; add two missing chat attendees with target-bound URLs and preserved report/attendance facts; add original Kimmel relation; leave cancelled original untouched.
- Checks and evidence: node --check passes; offline exact-snapshot buildPlan accepts union5 and Kimmel while preserving4PM restriction; three meaningful rejection cases pass. No network calls/inference/live writes by coder.
- Resulting state / acceptance: prepared script accepted for independent review/live dry-run. Generic replacement RPC may refresh database-managed relationship timestamps while preserving business facts.
- Remaining work and handoff: parent source/version/grant dry-run, evaluator gate, single apply and live readback.
