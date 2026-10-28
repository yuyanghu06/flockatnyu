# Worker image copies its actual reachable roots

- Local timestamp / acting role / milestone: 2026-10-27T19:44:50.012260-04:00 / coder / prompt-release-2026-10-27.
- Requested scope: safely deploy the Markdown migration and both prompt fixes.
- Starting repository state: main release e6c62403fa0bc6addb8af31449f73d52bf0e5e97; successful CI/release artifact, no new upload.
- Work performed / changed files: Applied exact reviewed correction6b1502e as ee936d24edc96d1bfbc4f9e78b64b96865471530. Only deployment/agent-worker/Dockerfile and tests/runtime-deploy.test.mjs changed. Remove stale COPY tools, copy src/api and check JavaScript in server/src/api. Tests now project real COPY paths and import the actual web app and worker adapters/handler with networking denied.
- Decisions: correct the deploy image rather than upload a known-broken worker package. Keep prompt payloads, source behavior, worker disabled state and unrelated Calendar fixes unchanged.
- Checks and evidence: exact artifact source comparisons; independent evaluator file/import review; source commit6b1502e; focused independent container regression running with no production credentials.
- Resulting state / acceptance: Correction implemented; independent local verification and standard hooked publication remain pending.
- Remaining work and handoff: finish tests/review, publish the correction, use a fresh successful main release artifact, coordinate overlapping rollout and verify actual deployment without a production cycle.
