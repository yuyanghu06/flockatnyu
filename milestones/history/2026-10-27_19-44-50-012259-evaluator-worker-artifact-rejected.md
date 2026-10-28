# Worker artifact rejected before upload

- Local timestamp / acting role / milestone: 2026-10-27T19:44:50.012259-04:00 / evaluator / prompt-release-2026-10-27.
- Requested scope: safely deploy the Markdown migration and both prompt fixes.
- Starting repository state: main release e6c62403fa0bc6addb8af31449f73d52bf0e5e97; successful CI/release artifact, no new upload.
- Work performed / changed files: Read-only independent review confirmed absent tools COPY input and omitted required src/api root in the e6c6240 worker artifact. Prior prompt/package membership checks did not establish the actual image filesystem.
- Decisions: correct the deploy image rather than upload a known-broken worker package. Keep prompt payloads, source behavior, worker disabled state and unrelated Calendar fixes unchanged.
- Checks and evidence: exact artifact source comparisons; independent evaluator file/import review; source commit6b1502e; focused independent container regression running with no production credentials.
- Resulting state / acceptance: REQUEST CHANGES for the old worker artifact. No Railway upload or hosted request occurred.
- Remaining work and handoff: finish tests/review, publish the correction, use a fresh successful main release artifact, coordinate overlapping rollout and verify actual deployment without a production cycle.
