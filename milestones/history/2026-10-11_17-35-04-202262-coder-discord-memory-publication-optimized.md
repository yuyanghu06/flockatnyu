# M18 memory publication optimized locally

- Local timestamp / acting role / milestone: 2026-10-11T17:35:04.202262-04:00 / coder / M18.
- Requested scope: Resolve the actual hosted grouping timeout without changing applied003 or weakening boundaries.
- Starting repository state:108828originals/216completed checkpoints;0groups after atomic timeout rollback; cron off.
- Work performed / changed files: New202610120004_discord_memory_rebuild_performance.sql and evidence/m18-discord-memory/memory-performance-coder-report.md. Root inspected both and serialized docs. Applied003 unchanged.
- Decisions: Materialize eligible source/channel pairs once, classify originals once using equivalent inline NY periods, insert groups/members atomically via exactkeys. Retain policyshare/guildmutex, invoker privileges and returnshape. Explicit guild/channel predicate prevents malformed originals polluting counts. No timeoutconfigurationchange.
- Checks and evidence: Genuine4migrationPGlite benchmark108828originals/216sources matches original7488groups/allunique memberships/0countmismatches, ~1.92x faster.33DST/month/cutoff/asof cases match periodhelper. Existing16checks passed; independent expanded test/review pending. Gitdiffcheck clean.
- Resulting state / acceptance: Coder local checks pass; performance timings are WASM, hosted timeout resolution unverified.
- Remaining work and handoff: Independent4migration/skewedscale/boundary tests and evaluation; apply004 only after acceptance, classify live originals, deploy and verify hosted worker/schedule.
