# Go Greek catalogue migration SQL verified independently

- Role/scope: tester; new tests/go-greek-building-sql.test.mjs and ignored evidence only.
- Executed: node --test tests/go-greek-building-sql.test.mjs passes10tests; syntax and scoped whitespace pass. Actual001–035plus037 applied in PGlite; optional036compatibility also passes but no hosted036application is authorized here.
- Preservation: exactly one target added; all existing rows/timestamps, event relationships, schema/index/trigger/policy/function/security metadata unchanged. Replay identical; name and alias conflicts fail atomically. Runtime catalogue DML and browser reads remain denied.
- API: actual SQL-backed production presence service returns statusok and Go Greek with empty people/events. No frontend wording/browser claim from this pass.
- Cleanup: rollback-only fixture deletion preserves all others; linked deletion rejected by exact FK with no cascade. Hosted application unverified.
- Reviewed037SHA256:6edbb0d8aab0a7c2ece251f05b65caf6f9c970aa8b60e3a4cb2cc94fa3670f4b. Evidence:evidence/683-broadway/backend/sql-verification.json. Verdict PASS.
