# discord discovery memory contract

- Local timestamp / role / milestone: 2026-10-11T16:44:44.244153-04:00 / planner / M17→M18.
- Requested scope: Authorized Discord launch, then automatic discovery/blacklist and archive rebuild.
- Starting state: Existing uncommitted M16/M17 implementation on codex/dev; prior snapshot still reported access denial.
- Work and evidence: Read-only planner proposed service-only guild policy/revision, metadata hierarchy and durable archived thread discovery; ancestry exclusions enforced in persistence/retrieval; scoped reset preserves operator/source ACL/non-Discord data. NY rolling seven-day daily groups take precedence, then current-month Monday weekly groups, then earlier-month monthly groups. Structured groups contain original records, no AI summaries/vectors. Specialist implementation and independent tests started.
- Decisions: Secrets remain private; reset only Discord guild archive, preserve unrelated Supabase data. Exclude category IDs 1461311169586266165, 1533053124606955600, 1203562092213305371, 1203562092376891445 and channel 1203562091982622819 with descendants. No image attachment storage or model calls.
- Resulting state: Historical launch successful; Railway collection now paused; M18 replacement implementation pending.
- Remaining work / handoff: Implement, test/review migration, apply policy, reset/rebuild eligible channels, verify time buckets and deployment.
