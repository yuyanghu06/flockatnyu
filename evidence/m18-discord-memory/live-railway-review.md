# M18 independent hosted Railway review

Verdict: PASS. Read-only evaluator inspected the exact replacement deployment,
filtered service settings and four aggregate/catalogue Supabase queries.
No mutations, credentials output or child agents.

Deployment e5ec96e5-d670-43e0-b32b-cdf138c81ad8 logged ready/exitCode0/complete:
216 channels/pages,8218 scanned,251 upserts,0 embeddings. SUCCESS/EXITED/stopped
is expected for this one-shot worker. Cron15 6 * * *, next2026-10-12T06:15:00Z;
restart NEVER, no domain/healthcheck. Both discovery and sync budgets900000ms.

Hosted storage:108836 unique originals,779 groups,108836 unique memberships,
0unassigned,216 succeeded checkpoints at21:58:22.897Z. Groups asOf22:03:03.249Z;
originals by tier:daily1869,weekly1626,monthly105341. Exact four-category/one-channel
blacklist and unknown-channel denial retained. Zero source/identity/timestamp,
citation/hash/image/vector/membership/count/policy mismatches. Independently
checked all memberships with zero tier/period/window mismatches. ForcedRLS,
browser denials and service-only invoker RPCs intact; no reader grants added.

Accept hosted rebuild, replacement worker and configured daily schedule. The
first actual cron-triggered invocation remains unobserved. M20 summary generation
is separate and was not reviewed or claimed by this pass.
