# Queue polling cost review

- Local timestamp / acting role / milestone: 2026-10-17T15:23:37.695087-04:00 / orchestrator / post-M39 advisory.
- Requested scope: Explain queue-check overhead and cost.
- Starting repository state: Prior status/naming and concurrent changes preserved.
- Work performed / changed files: Inspected automation store/claim SQL and current official Supabase/Railway pricing; updated journal only.
- Decisions: Distinguish polling from model inference and persistent-worker hosting; do not present an unmeasured monthly bill as fact.
- Checks and evidence: Each enabled idle tick makes one PostgREST claim RPC, locks the runner row briefly, and counts eligible pending entries with their oldest receipt time using a cache/state join. An empty/waiting claim returns status without a model call. At5seconds, theoretical idle volume is17280/day or518400/30days, slightly lower with request time. Supabase pricing includes unlimited API requests; compute/egress still apply. Railway guide lists RAM at10USD/GB-month and CPU at20USD/vCPU-month. Sources: https://supabase.com/pricing and https://docs.railway.com/guides/right-size-cpu-memory . No load benchmark or billing query; count/join work can grow with retained metadata/backlog.
- Resulting state / acceptance: Polling itself is expected to be inexpensive for a small queue; persistent RAM and actual model execution are separate cost drivers. Update agent remains inactive.
- Remaining work and handoff: Measure query latency/resources and worker RSS after deployment; no implementation or cadence changes requested.
