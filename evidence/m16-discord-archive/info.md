# Discord archive acceptance evidence

M16 independent local verification covers the Discord REST worker, JSONB/Postgres
archive, optional vectors, bounded retrieval, admin permissions and browser page.
`test-output.txt` contains the integrated 75-test run (75 passed, zero skips or
failures). `browser-results.json` records five installed-Chrome fixture checks;
screenshots show desktop, mobile and denied access states. `tester-report.md`
explains commands, fixed findings and remaining live-system limitations.

All Discord, database HTTP and provider requests in these tests use fixtures.
SQL runs in an in-memory PGlite PostgreSQL engine with the pgvector extension.
No cloud schema, Discord history, real model response, Railway job or production
member-authentication behavior was verified.
