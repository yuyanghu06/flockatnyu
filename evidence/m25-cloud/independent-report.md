# Independent hosted M25 audit

- Milestone / role / scope: M25 / tester / independent read-only audit of actual Supabase cutover and Railway configuration. This is structural and preservation acceptance, not acceptance of a completed embedding backlog or future scheduler execution.
- Starting state and files inspected: AGENTS.md, current milestone/to-do, latest linked M27 history, agent workflow and assignment/report templates; accepted migration011 and live-summary CLI; `before.json`, `after-raw-cleanup.json`, `preservation.json`, `railway-manifests.json`, `live-chat-smoke.json`, and cloud evidence guide. Concurrent root workers were already processing summaries and embeddings. Existing dirty files were preserved.
- Work performed and changed files: Added `independent-audit.json` and this report. Created `/tmp/tech-nyu-cloud-audit.sql` containing a transaction beginning `BEGIN READ ONLY` and ending `COMMIT`, with aggregate metadata queries only. No application/shared journal edits, hosted mutations, model calls, Google calls, raw message retrieval or summary-text retrieval.
- Decisions and assumptions: Current snapshots can differ because workers run concurrently. Service status `ready` means the status request succeeded; it does not mean the backlog is drained. Catalogued privileges plus actual browser-role denial probes establish the current access boundary without attempting a write.

## Executed checks

1. `python3 /tmp/tech-nyu-sql.py /tmp/tech-nyu-cloud-audit.sql --write` — exit0. The helper's normal operator connection was used only inside an explicit read-only transaction. Snapshot at `2026-10-15T20:45:38.557291Z`:
   - Raw Discord messages0, revisions0, copied Discord knowledge documents0, chunks0, daily summaries0; summary-only guard enabled.
   - Legacy summaries722, fingerprint `4dd4471d4d877a9c60cd94ab4cee2c6a`, identical to the pre-cutover baseline.
   - Legacy receipts2245, fingerprint `f54b3cd94da5f37ca4110697ea604da8`, and certificates722, identical to the baseline.
   - Policy revision3, unpaused, all four excluded category IDs and the excluded channel ID unchanged.
   - All six new tables enable and force RLS; anon/authenticated have no table privileges; service_role has read/write privileges.
   - All19 `discord_live_summary_%` functions use invoker security, deny anon/authenticated execute and permit service_role execute.
   - All four old-write retirement triggers exist and are enabled on messages, revisions, legacy jobs and legacy results. No write was attempted by this audit.
   - All218 source grants are local-development grants, with zero write grants and zero grants to other principals.
   - Vectors35ready/723total,687pending and1running; every ready vector is1536dimensional; zero stale content hashes. All688 outstanding vectors are currently eligible.
   - One new monthly result covers September1–October1 in America/New_York, with valid closed calendar boundaries, success state, input hash/pages and empty-period consistency. It represents an empty period; the citation-format check therefore has no nonempty new result to exercise yet.
2. Read-only denial probes through the same helper — expected exit1 for each of four probes. Each transaction explicitly set local role `anon` or `authenticated`, then attempted either `SELECT 1 FROM public.discord_summary_vectors LIMIT 0` or `SELECT public.discord_live_summary_status('1203562091500404776')`. All four returned permission denied. Probe metadata is saved in `browserRoleRuntimeDenials`.
3. `node --env-file=.env server/discord/live-summary-cli.js status` — exit0, safe counts only. Reports summaryOnly=true, rawMessages0, legacySummaries722, summaries1, pendingJobs437, readyEmbeddings35 and missingEmbeddings688.
4. `railway status --json`, filtered in memory to the exact Tech NYU project and the two Discord services — exit0. Saved current service and deployment-manifest fields agree:
   - `discord-archive`: `node server/discord/cli.js discover`, daily `0 10 * * *`, restartNEVER, no health check. Current deployment46fc58c6 isSUCCESS and its instanceEXITED.
   - `discord-summaries`: `node server/discord/live-summary-cli.js scheduled`, hourly `10 * * * *`, restartNEVER, no health check. Current deploymentcc2bdf36 isSUCCESS and its instanceRUNNING.
   - The earlier saved manifest reports a CRASHED summary invocation. This history is preserved. Current readback establishes its later running state, without establishing a successful one-shot completion.
5. Inspected existing root live-chat smoke evidence: HTTP200, meta/delta/done, three Discord sources and an original link; live `read_discord_window` reports complete, with an explicit text-only/nontext count. This audit did not replay the model call and does not independently certify the answer's semantic accuracy.

## Findings, verdict and handoff

**PASS / ACCEPT for the observed hosted structural cutover, data preservation, access boundaries, current vector integrity and explicit Railway runtime configuration.** No structural defect found in these checks.

**Completion remains pending.** At the independent snapshot,437 summary jobs and688 vector records were outstanding. Weekly publication, a nonempty newly published result's original citations, complete embedding coverage and successful final worker exit were not yet established. Natural future cron execution is unobserved; configured next-run times are not execution evidence. Semantic summary accuracy and permission-denial fallback behavior are outside this hosted metadata audit and rely on separate local tests/live evidence.

The root should finish/drain the authorized bounded work, repeat these aggregate checks, verify a nonempty new weekly/monthly result and final operational receipts, then record the remaining scheduler-observation limitation. Do not describe `status: ready` as all summaries embedded. The orchestrator owns shared milestone/history and cloud `info.md` updates; no folder-guide edit was permitted in this assignment.
