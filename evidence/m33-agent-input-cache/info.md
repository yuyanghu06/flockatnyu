# M33 shared input cache verification

Goal: independently verify local migration018's exact two-column shared JSON
buffer and service-only database boundary, while preserving the001–017 baseline.

- `tester-sql.log`: final executed Node/PGlite output,10/10 passing.
- `tester-sql-initial.log`: initial test-only failure due to PostgreSQL18 exposing
  NOT NULL in pg_constraint; corrected in the test without changing migration SQL.
- `tester-report.md`: scope, executed checks, acceptance and limitations.

Acceptance covers actual migration SQL, schema/data preservation, JSON round trips,
constraints, ACLs, RLS and exact UUID cleanup. Local verification is complete;
hosted application, source ingestion, retention/scheduling and tool execution are
outside this evidence.
