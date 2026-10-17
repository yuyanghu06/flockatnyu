# Collector acceptance and bounded tool organization plan

- Local timestamp / role / milestone: 2026-10-17_14-59-55-608233 America/New_York / orchestrator / M36 complete, M37 planned.
- Requested scope: finish cleanup, centralize callable tools, separate developer scripts and prepare for parallel map/UI and agent work.
- Starting repository state: extensive preserved user changes; M36 collector deployments already active.
- Work performed: inspected final independent live_collectors_verifier report and prior evidence. Evaluator ACCEPT covers configured rollout and demonstrated restart. Discord c8035dd4-e073-477a-9fcd-dadc5334b4ef and Gmail 1f4d4571-ebdc-4295-b016-91f4eec956c1 SUCCESS/RUNNING; same intended Supabase, no cron, health checks and bounded restart. Discord close4200 then resumed at 18:56:46 UTC. Migration020 hosted receipt20261017184647 preserves schema/ACLs and unrelated data.
- Checks: independent final focused58/58; orchestrator full581/581; earlier API/web builds and isolated package checks passed. Existing evidence under evidence/m36-collector-cleanup. Browser admin runtime was not exercised.
- Decisions: M37 moves four existing tool modules to tools/{discord,google,miro}; developer scripts move to scripts. Preserve behavior, source clients and slim collector closures. No new write tools, prompt/memory schema, deployment or model call. Side-conversation restrictions require sequential implementation/review here; no new specialists.
- Acceptance / limits: M36 configured rollout accepted. Native create/email observed; hosted edit/delete and excluded-channel/thread probes remain pending. Expired Discord sessions can leave gaps without backfill.
- Remaining work: implement moves, fix imports/docs, run full suite/build/package checks, hand off directory ownership.
