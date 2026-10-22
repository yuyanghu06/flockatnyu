# Exact Go Greek catalogue migration037 applied through Supabase MCP

- Acting role: bounded ephemeral CLI owner migration operator, supervised by orchestrator. User explicitly authorized this record and requested MCP.
- Actual tools: execute_sql preflight, exactly one apply_migration(namego_greek_building), then read-only verification queries; all calls use projectjssehnrmqhstcrtxulpa.
- Hosted receipt:20261021205505_go_greek_building. Tool reports success. Applied query matches reviewed local037 except one terminal newline; stored trimmed-query MD5 4677f80195c7752fde3c45626c5902a9, reviewed file SHA256 6edbb0d8aab0a7c2ece251f05b65caf6f9c970aa8b60e3a4cb2cc94fa3670f4b.
- Postconditions: totalten rows; target683-broadway / Go Greek / ['683 Broadway']; other catalogue MD5 unchanged; service INSERT/UPDATE/DELETE remain false; targetlinks0; event/relationship counts22/9/3 unchanged; map_read_events includes target; pending036 absent.
- No other migration, event, permission, source, deployment or connection setting changed. Ignored hosted receipt and raw MCP metadata evidence are under evidence/683-broadway/backend.
