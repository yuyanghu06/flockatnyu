# Agent pass report: M20 summary baseline

- Milestone / role / scope: M20 / independent tester / local provider, runner,
  store and genuine six-migration summary baseline. This report covers the former
  original-preserving daily/weekly/monthly implementation contract. **The user
  subsequently changed the goal: no daily summaries; verified weekly/monthly
  retention must replace older raw records, and monthly rollup is only for the
  previous calendar month. This baseline pass does not accept that new design.**
- Starting state and files inspected: AGENTS, rolling milestone/to-do/latest
  linked history, agent workflow/tester/coder/report instructions, planner report,
  summary config/provider/runner/CLI/store and migrations 001–006. Existing M18
  production storage was not accessed or changed in this pass. Coders worked
  concurrently and retained exclusive implementation/documentation ownership.
- Changed files: only tests/discord-summaries.test.mjs,
  tests/discord-summary-provider.test.mjs, tests/discord-summary-sql.test.mjs,
  this report and assigned local evidence logs.
- Decisions / assumptions: providers/fetches are local fixtures; no network,
  model credential reads, model calls, live SQL, deployment or children. PGlite
  runs all six real migrations with pgvector available but no embeddings. The
  representative fixture has 108,828 originals / 779 groups / 216 source
  configurations / 5,659,056 extracted text bytes, fresh statistics and a largest
  5,000-original group. Local timings do not establish hosted performance.

## Executed checks

- node --test tests/discord-summaries.test.mjs tests/discord-summary-provider.test.mjs tests/discord-summary-sql.test.mjs > evidence/m20-discord-summaries/final-summary-tests.log
  exited **0**, **52/52** passed at that checkpoint. Three later timeout/preview/
  calendar regressions are included in the final integrated run below.
- node --test --test-name-pattern='genuine six|actual SQL-sorted' tests/discord-summary-sql.test.mjs > evidence/m20-discord-summaries/sql-guard-resume-tests.log
  exited **0**, **14/14** selected checks passed.
- node --test --test-name-pattern='exact operation caps|more than ten' tests/discord-summary-sql.test.mjs > evidence/m20-discord-summaries/billing-resume-tests.log
  exited **0**, **2/2** billing/resume checks passed.
- node --test --test-name-pattern='genuine six' tests/discord-summary-sql.test.mjs > evidence/m20-discord-summaries/calendar-guard-tests.log
  exited **0**, **14/14** selected SQL/calendar/permission checks passed.
- **Final:** node --test tests/assistant.test.mjs tests/backend-provider.test.mjs tests/knowledge.test.mjs tests/discord*.test.mjs > evidence/m20-discord-summaries/integrated-tests.log
  exited **0**, **191/191** passed, zero skips/failures. All three new summary
  files are included. The package test:discord script uses this same wildcard.
- **Final:** npm run build:api > evidence/m20-discord-summaries/api-build.log
  exited **0**, API syntax/runtime dependencies verified.

Final integrated scale timings: preview **8,448.6 ms**, operation creation
**11,229.0 ms**, largest current fingerprint **320.1 ms**, identical-manifest
operation reuse **8,863.3 ms**. Preview/begin have function-specific 60-second and
store 65-second budgets; ordinary paths retain normal budgets.
The unchanged M18 rebuild scale test passed at **2,189.8 / 2,194.5 ms**.

## Independently verified behavior

- Luna/official endpoint pinned; request service_tier=default, reasoning none,
  store/stream false, strict JSON schema, text-only input, no tools/images/vectors
  or redirect following. Malformed/refused/incomplete/foreign citations and
  invalid usage fail closed. Exactly two transient retries; each dispatch is
  reserved/accounted, with uncertain responses charged conservatively. Request
  timeout is 30 seconds and caller aborts return sanitized errors.
- Paginated canonical evidence includes author/reply/content/retained embed and
  component text, component/PDF links and their fingerprint changes. Oversized
  Unicode/control evidence is reconstructed exactly from 8,000-codepoint segments,
  with bounded UTF-8 JSON chunks and no truncation. Complete coverage, recursive
  reduction, stalled/foreign/duplicate/missing inputs and cache tampering are
  checked. Concurrent workers share strict request caps.
- Stable source/tier/calendar/input cache survives bucket UUID regeneration.
  Real SQL-sorted mixed map/reduce children and reversed cached coverage resume
  without redispatch. More than ten one-request pauses complete without exhausting
  terminal failures. Exact operation cost/request caps allow free cached
  publication retry while new reservations remain blocked.
- Nine new tables are forced-RLS/browser-denied; summary helpers/RPCs are invoker
  and service-only. Foreign/expired leases, wrong-source citations, incomplete
  coverage, paused/blacklisted publication and changed membership fingerprints
  are rejected. Citations use canonical source URLs. Trusted scopes and database
  reader grants are both required; stale rows do not end pagination early.
  Daily-to-weekly rollover creates the correct calendar job and hides obsolete
  output under the former baseline contract.
- Scoped authorized reset deletes only target guild summary/archive records and
  preserves unrelated guild originals/jobs, policy/config/operator/source ACL.
  Normal baseline generation preserves raw originals and produces no vectors.

## Findings, fixes and limits

Material findings resolved and retested:

1. Provider accepted negative or excessive cached-token counts.
2. Over-estimate usage was passed as successful instead of uncertain accounting.
3. Canonical input omitted retained embed/component text and component URLs.
4. SQL save-part used an ambiguous v alias (42702), blocking publication.
5. Store rejected uncertain usage=null instead of recording unknown charges.
6. Cached child/coverage order could differ from SQL ordering during resume.
7. Stale succeeded rows consumed LIMIT before being skipped.
8. Routine budget pauses consumed the ten-attempt failure limit; the stall is
   preserved in budget-resume-first-failure.log.
9. Preclaim operation caps blocked cached-only finalization.
10. CLI preview omitted safe manifest/cache/size/revision counts.

Initial provider failures are retained in provider-tests.log and
provider-accounting-tests.log; the initial CLI omission is in cli-preview-tests.log.
Fixture correction: expected SQL errors inside an explicit transaction require
savepoint rollback before further assertions. This was not an application defect.

No actual model-summary factuality, hosted six-migration execution or scale RPC,
live pilot, full manifest generation, deployment/schedule health, multi-process
contention stress, or replacement/deletion retention acceptance is claimed.
Valid structured output/citations alone do not establish factual accuracy.

- Acceptance verdict: **PASS for the prior-scope technical baseline only**.
  Current corrected weekly/monthly retention milestone remains **pending**.
- Folder-guide updates needed: orchestrator owns the evidence guide, retention
  contracts and serialized milestone journal.
- Handoff: freeze this baseline as evidence. Await the retention planner before
  changing tests for no-daily generation, Monday/month-start New York scheduling,
  previous-month rollup and verified replacement of older raw originals. Do not
  apply baseline 006 or delete production originals based on this baseline pass.
