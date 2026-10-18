# Fixed map building write scope

Independent local database verification for forward migration022, restricting
the application service role to UPDATE(people_here) on map_buildings.

- `local-tests.json`: executed commands, exit results, migration hashes and
  aggregate coverage. All fixture identities are synthetic/local.
- `test-report.md`: independent tester handoff, acceptance and limitations.
- Reproduce with `node --test tests/map-building-write-scope.test.mjs`.

These checks execute migrations001–022 in PGlite with pgvector and explicit
Supabase-style roles. They do not assert hosted application or deployment.
No credentials, Discord directory or live presence data are stored here.

`hosted-verification.json` records primary application of only022, exact receipt/file hashes, effective per-column ACLs and unchanged map rows/function definitions/other-table metadata. Actual service-role allow/deny probes were rolled back; the five Bobst debug occupants remain intact.
