# Fixed catalogue sql verified

- Local timestamp / acting role / milestone: 2026-10-17T16:30:16.959109-04:00; tester; map-building-write-scope.
- Requested scope: independent actualSQL verification of people_here-only service writes.
- Starting state: new022 available; applied021 preserved.
- Work performed: tester added tests/map-building-write-scope.test.mjs and aggregate local evidence/report only; no implementation/cloud edits.
- Checks and evidence:11/11 newPGlite001–022 checks;26/26 existing map schema/roster checks; API build and scoped whitespace/syntax PASS. Tests deny protected/no-op/mixed/UPDATEFROM/CTE updates, INSERT/DELETE/TRUNCATE/upserts, browser access; permit validated presence updates, trigger timestamps and invoker atomic moves. Allseven table contents/unrelated ACLs preserved.
- Decisions: no visual/performance retest for ACL-only change; historical021 fixture unchanged.
- Resulting state / acceptance: PASS local restriction; hosted application parent-owned.
- Remaining work and handoff: evaluator and primary deliberate022 application; standardcommand integration/documentation.
