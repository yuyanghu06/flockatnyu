# Live Miro MCP

Both the chat agent and update agent use the official remote Miro MCP at https://mcp.miro.com/. The old REST tool, snapshot collector, deployment files and Railway miro-sync service are retired. Migration030 removes miro_boards and its sync RPCs. Applied migrations and historical SQL verification fixtures remain immutable audit evidence; their frozen JavaScript harness is under tests/fixtures/retired-miro-rest and is never imported by the application.

Miro content is fetched live in request/batch memory. No board snapshot, summary or sync state is stored. Existing knowledge_sources retains the same source UUID/external board ID/status and only miro_scope={enabled,team_id}. The backend checks exact configured board IDs, the shared source allowlist and current enabled registry policy before and after a read. Configured team ID must match the registry. Miro's team-scoped OAuth session enforces current provider access; the canvas/table schemas do not independently report an authoritative live team ID.

## Agent tools

- list_miro_boards returns the authorized local catalogue only.
- read_miro_board uses canvas_search for overview or related-pattern searches. Search matches locate evidence and do not authorize writes.
- read_miro_item uses canvas_read_as_svg for actual notes, visual calendar grids, headings and surrounding context, or table_list_rows for native data tables. Calendar grids use canvas reads. SVG stays inert, untrusted evidence.

The transport permits only these three upstream read tools. It rejects every upstream write tool, arbitrary endpoints, redirects and oversized responses. Miro currently returns boards:read boards:write openid email despite the requested boards:read openid email; this observed OAuth scope mismatch does not expose Miro writes to either agent.

Read narrowly: search the requested event, then read the returned item IDs together with date headings/cells and legends. Partial/skipped content remains explicit. Large results use bounded JSON fragments with a content hash; repeat identical read arguments with offset=nextOffset and expectedHash=hash. A change requires restarting; fragmented reads do not authorize writes. Use narrower content reads before a mutation. Raw validated board IDs are sent upstream because Miro's parser rejects percent-encoded equals signs; original citation URLs remain canonical.

## Application authentication

Run npm run miro:connect. The local PKCE/state OAuth flow selects the board's team and stores application-owned credentials in ignored .miro-mcp-auth.json with0600 permissions. It never reads Codex's credential storage. Refresh token rotation is atomic, and API/worker processes sharing the file use a lock. The developer Codex connection is separately installed and authenticated through the user's shared MCP settings.

For a hosted agent, supply MIRO_BOARD_IDS, MIRO_TEAM_ID, existing shared Supabase/source scope, and a private persistent MIRO_MCP_AUTH_FILE volume. Alternatively bootstrap client/refresh credentials through service secrets and enable MIRO_MCP_PERSIST_AUTH with a writable persistent auth file. Env-only refreshed tokens live in memory and are insufficient across restarts after rotation. Never commit tokens or copy them into model/tool output.

## Calendar reconciliation

Each eligible update-agent batch gets fresh MCP navigation context, then reads concrete relevant content. Google Calendar writes still use the fixed-target Calendar API tools. Only observed live content-backed sourceKey values authorize actions: miro:<board>:<item> for a real event object, or miro:<board>:<table>:row:<stableRowId> for a native table row. Frames, grids, snippets and metadata cannot stand in for individual events. Preserve exact source links, explicit dates/timezones, existing ends, managed ownership, human edits and cancellation evidence. Missing/partial reads never imply cancellation.

The current fixed Calendar preflight returns owner access. The update worker remains separately disabled/undeployed until deliberately activated; this change does not activate processing or grant Google access. Local chat has successfully answered the HP date from the actual October calendar cells through MCP. See the milestone for current hosted030 and acceptance receipts.

References: [Miro MCP setup](https://developers.miro.com/docs/connecting-to-miro-mcp), [official tools](https://developers.miro.com/docs/miro-mcp-tools), [OAuth and permissions](https://developers.miro.com/docs/miro-mcp-server-frequently-asked-questions).

## Verified Schedule structure

Read-only Chrome inspection in the School profile on2026-10-18 found three boards in Nyu Team: Tech@NYU Schedule, Adobe.NYU Schedule and IFA Fall2026 Schedule. The application catalogue currently authorizes only Tech@NYU Schedule. OAuth visibility and this structural guide do not expand the configured source scope. Other boards reuse template object IDs; source identity always includes the board ID.

Schedule is a large canvas with separate spatial calendars:

| Question | Starting section |
| --- | --- |
| Public club events or promotional work | Events + Marketing |
| Eboard bonding, social or internal plans | EBOARD |
| Program/eboard applications and deadlines | APPLICATIONS |
| Mentoring timeline | Mentorship |
| Forms, graphics requests or room-booking resources | Important Links and nearby resource notes |
| General board overview | Sampled overview, then relevant sections |

Copy of APPLICATIONS is an ambiguous copied area, not an automatically authoritative schedule. An older2026 Calendar area has its own category legend. Events + Marketing has a separate local legend distinguishing events, marketing, unconfirmed entries and ambassador collaborations. Agents re-read the local legend rather than applying one palette across the board. Promotional tasks are distinct from event dates; unconfirmed entries are not confirmed events.

The inspected layout places EBOARD on the left, APPLICATIONS in the middle and Events + Marketing on the right; Mentorship is below the right section, Copy of APPLICATIONS below the middle, and the older Calendar area above. These headings are spatial labels rather than reliable API parent folders: actual MCP searches targeting either public/applications header returned no month matches. Search the board, use returned coordinates and nearby headings, and read bounded candidate months together when uncertain. Repeated month names identify distinct section calendars. Some copied frames have outer2027/2028 titles but inner2026 headings. Neither the outer title nor a copied inner label alone establishes the year. Inspect section context, month/day grid and corroborating notes; disclose uncertainty and defer Calendar changes when these conflict.

server/miro/navigation.js supplies shared structural hints to chat and update prompts. The hints are navigation only; actual activities, dates, links and mutation provenance come from fresh authorized MCP reads. Search a named subject directly, or combine the relevant section label and requested month/year with resultMode=areas. Use returned spatial bounds/containing headings to select relevant month canvases. If section assignment remains uncertain, read bounded matching month candidates together with returned section/legend IDs. Do not stop at search metadata when a content read is available. Read actual month cells, notes and local legends; narrow oversized reads and follow continuations. Explicit Miro-only requests stay on Miro. A broad question requires relevant distinct sections or an explicit coverage limitation.

Valid zero-match searches may omit results. The reader normalizes only verified empty output and grants no event/write evidence. Empty searches and unvisited/partial areas do not establish absence or cancellation. The chat budget is currently eight calls/eight planning rounds; it is bounded and cannot guarantee every board or section was read. Update preparation remains bounded, with separate activation required.

Representative real-model acceptance reached actual public/internal October canvases, separated events from promotional tasks, answered a named-event question with missing time preserved, and flagged an applications year conflict. Initial tests exposed premature navigation stops; bounded candidate and relative-layout guidance corrected the public route. Provider skipped content and model-driven routing still require explicit partial coverage. Aggregate receipts: evidence/miro-mcp/structure-verification.json.
