# Go Greek backend registration contract

- Role/scope: planner; user authorized the proposed Supabase catalogue row and cleanup documentation.
- Plan: new migration037 adds only id683-broadway, name Go Greek and alias683Broadway. Use existing map advisory lock, insert-on-conflict-do-nothing and exact postcondition guard; conflicting existing metadata fails without overwriting. Preserve schema/grants/RLS/all prior migrations and unrelated pending036.
- Acceptance: one added row, unchanged prior data/timestamps/events, idempotent replay, atomic conflict failure, denied runtime catalogue writes, current snapshot/API recognize the building with empty events. Future cleanup must respect exact identity and event_buildings ON DELETE RESTRICT; no automatic event/link deletion.
- Access: root has no exposed Supabase tools. Initial authenticated dashboard preflight read only showed9buildings, absenttarget,0targetlinks, denied service DML, latesthosted035. User explicitly requested MCP instead; dashboard use stopped before any mutation. Root is checking configured OAuth Supabase MCP through an ephemeral normal CLI session; no connection settings are changed.
- Starting state: large unrelated dirty tree retained; local036 pending and must not be bulk applied. Existing visual switch remains frontend-only.
- Next: bounded coder/tester, independent review, apply only reviewed037 through the MCP connection and verify hosted row/API, then update guides/journal.
