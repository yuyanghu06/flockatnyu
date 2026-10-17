# M25 independent summary-only backend verification

The independent tester owns this folder and two new test suites:

- `tests/discord-live-summaries.test.mjs`: direct Discord window coverage, calendar/DST boundaries, current ancestry permissions, map/reduce, complete Unicode embedding inputs, provider uncertainty, and safe runtime results.
- `tests/discord-live-summary-sql.test.mjs`: genuine migrations 001–011 in an isolated in-memory PGlite database with pgvector, cutover preservation and retirement, source ACLs, durable budgets/receipts, legacy/new embedding lifecycle, and the real store/runner integration.

`focused-tests.txt` records 44 passing checks. The SQL-backed runner fixture independently fetched two completed channel periods over four pages, published two summaries, embedded those plus the existing legacy summary, and retained zero originals for the target guild. An identical rerun dispatched no additional model or embedding requests. All model/bot/HTTP behavior was injected fixture behavior; no network requests, credentials, live database changes, deployments, or browser checks occurred.

The fixtures also seeded a pending legacy raw-input reference. Migrations 001–010 store only IDs, hashes, counts and time metadata there; raw canonical text/segments are assembled on read, not stored in input rows. Raw originals/copies/revisions were removed for the target guild, while existing weekly/monthly summary IDs, citations, certificates, compaction ledger, usage receipts, source grants and unrelated guild content were preserved. All relevant operational/content tables were scanned for the fixture raw sentinel after cutover/publication.

Reproduce focused checks:

```sh
node --test tests/discord-live-summaries.test.mjs tests/discord-live-summary-sql.test.mjs
```

The full existing Discord regression suite exited 0 with 328/328 checks in 61.9 seconds; output is in `full-discord-suite.txt`. Run it with:

```sh
node --test tests/discord*.test.mjs
```

See the tester pass report for the final result and execution limits. Local PGlite proves SQL behavior and grants in the fixture; it does not verify hosted PostgREST/schema installation, actual bot history coverage, real model/embedding outputs or billing, active Railway scheduling, or a production cutover. Expired model-phase leases fail publication safely and are retried; actual long-running worker behavior remains a deployment observation.
