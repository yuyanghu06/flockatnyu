# miro-mcp-reader-initial

- Local timestamp / role: 2026-10-18T13:36:10.378587-04:00 / orchestrator.
- Scope: shared live Miro MCP reader.
- Starting state: existing event/UI changes preserved.
- Work, decisions and checks: Implemented shared MCP navigation/canvas/table reader, inert SAX identity parsing, bounded hashed JSON continuations and board/source checks. Tested live Codex MCP HP calendar grid; actual day25+October2026 available. Initial HTTP uncovered encoded-board upstream parser failure and strict-canonical undefined navigation field failure; both corrected locally. Existing141automation/20assistant tests and API build pass; one old Miro stream-event assertion needs fixture repair. User subsequently requested removing legacy REST tools/snapshot table entirely; scope expanded, registry replacement planning underway. No source edits/Calendar writes/worker activation/deployment performed.
- Acceptance/handoff: live HTTP and independent acceptance still pending; follow latest scope removing snapshots. No credentials or private source contents in tracked evidence.
