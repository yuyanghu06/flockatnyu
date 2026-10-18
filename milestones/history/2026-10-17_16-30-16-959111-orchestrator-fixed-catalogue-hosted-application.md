# Fixed catalogue hosted application

- Local timestamp / acting role / milestone: 2026-10-17T16:30:16.959111-04:00; orchestrator; map-building-write-scope.
- Requested scope: enforce user-required fixedlocations in live Supabase.
- Starting state: hosted021,26people/9buildings/fiveBobst fixtures; broad map_buildings runtime CRUD.
- Work performed: appliedonly022 through exactproject ManagementAPI, storing exactoriginalSQL receipt20261017202855 in the same transaction. No older migration/receipt edits, no tables/functions/sourcecontent changes. Updated standardtestcommand, guides and persistent user boundary note.
- Checks and evidence: hosted effective serviceSELECTtrue, tableUPDATEfalse, onlypeople_here columnUPDATEtrue; INSERT/DELETE/TRUNCATEfalse; browserrolesallfalse. Before/after map data hashes/counts, publicfunction definitions and other table ACL/RLS metadata match. Actual SETLOCALROLEservice_role protected/mixed/insert/delete/truncate probes deny42501, validpeople_here update/internaltimestamp/invokermove succeed; transaction rolled back and exactdatahash restored. Receipt MD5 matches localSQL; evidence/map-building-write-scope/hosted-verification.json.
- Decisions: no new agent tools exposed; future location tools inherit narrow boundary. updated_at remains trigger-managed, never caller input. Catalogue changes require owner maintenance.
- Resulting state / acceptance: live restriction verified;37/37 standardtest:map-roster nowPASS. FiveBobst testentries remain intact. Readsmoke after restarting endeddebugsession returnsHTTP200/fivepeople.
- Remaining work and handoff: final evaluator/guide integration. Primary restored local4187/API3127 in session58653 after transferred specialist session ended; existing5173/3001 preserved. No Railway deployment, model run, commit or push.
