# Miro board capture and calendar reconstruction

Researched October 15, 2026 against official Miro documentation. This is a
historical feasibility study. M27 subsequently implemented the bounded sync/API
infrastructure described in [miro-sync.md](miro-sync.md); current live authorization
and deployment state belongs in the rolling milestone. Research itself made no
Miro account or board changes.

## Confirmed plan: Free

The user confirmed the club uses Miro Free. REST and official MCP remain viable
for supported content; Enterprise export is unavailable. Manual exports are small
and low-resolution. Prefer structured extraction and reconstruction, starting with
one calendar frame; use ordinary browser screenshots for supplemental visuals if
needed, with automation still untested. No upgrade is required to test extraction.
Sources rechecked October 15: the UI export guide, REST introduction and MCP FAQ
linked below. Actual board/widget coverage remains unverified.

## Interfaces and authentication

- REST API v2 runs from a backend even when nobody has the board open. OAuth 2.0
  grants access on behalf of a user. Start with `boards:read`; creating/updating
  content requires `boards:write`. Keep tokens and refresh handling server-side.
  [OAuth guide](https://developers.miro.com/docs/getting-started-with-oauth).
- The Web SDK runs inside an open Miro board. It can control the viewport and
  provide a selection interface; it is not an unattended backend worker.
  [SDK comparison](https://developers.miro.com/docs/miro-web-sdk-vs-rest-apis).
- Official Miro MCP offers broader structured content capabilities. Current
  overview/FAQ say it is available across plans, with Enterprise admin enablement.
  The older REST/MCP comparison still says Enterprise-only and references removed
  tools; prefer the current tools reference and removal changelog, then verify the
  actual authenticated tool list. No Miro tools are connected in this session.
  [FAQ](https://developers.miro.com/docs/miro-mcp-server-frequently-asked-questions).

## Actual images versus board data

No general standard REST endpoint for rendering a whole board, frame or arbitrary
rectangle into a screenshot was found in the reviewed documentation. Reading an
image item downloads that existing image, not a composite of surrounding objects.

| Route | Whole board / smaller region | Limits |
| --- | --- | --- |
| Miro UI export | Select an area or export a frame; wrap all objects in a frame for a whole-board image | JPG, PDF and SVG options; resolution depends on plan, including Education; owner must allow export |
| Enterprise Board Export API | Export specified boards, then download/process results | Enterprise Company Admin plus eDiscovery, `boards:export`; SVG, HTML or PDF rather than direct PNG |
| Authenticated browser capture, proposed | Fit content for an overview, or capture a target frame; tile at readable zoom for large boards | Separate browser workflow, not REST screenshot API; rendering/load/session reliability needs testing |
| Our renderer, proposed | Render supported item data or normalize MCP SVG into a calendar view/image | Can be searchable and selective; matching Miro pixels is not guaranteed |

Official references: [UI export](https://help.miro.com/hc/en-us/articles/360017572754-How-to-export-your-board),
[Enterprise export](https://developers.miro.com/reference/enterprise-create-board-export),
[image resource example](https://developers.miro.com/reference/create-image-item-using-local-file).

The canvas is infinite. A browser full-page screenshot does not inherently include
offscreen canvas content. A whole-board overview may make text illegible; frame or
month/week captures are preferable for reading. Tiling/stitching is an engineering
proposal, not something tested here. UI export also excludes comments/frame titles.

## Read everything, then narrow by frame or date

Documented REST request shapes (illustrative; not executed):

```http
GET https://api.miro.com/v2/boards/{board_id}/items?limit=50
GET https://api.miro.com/v2/boards/{board_id}/items?type=frame&limit=50
GET https://api.miro.com/v2/boards/{board_id}/items?parent_item_id={frame_id}&limit=50
Authorization: Bearer <server-side-access-token>
```

Follow every returned cursor. The documented maximum page size is 50. Frame IDs
are a useful boundary for a month, week or project. For a calendar without frame
parentage, fetch supported items and filter using normalized coordinates. Respect
parent-relative positions, dimensions and rotation before testing rectangle
overlap. Nested containers need explicit traversal; do not assume a frame response
is a flattened recursive export.

References: [list items](https://developers.miro.com/reference/get-items-1),
[frame items](https://developers.miro.com/reference/get-items-within-frame),
[coordinates](https://developers.miro.com/docs/boards).

An arbitrary visual calendar is not inherently structured event data. Map an item
to a date using explicit text, or calibrated day-cell bounds plus month/year
headings. Preserve ambiguity when time, year, timezone or event boundaries cannot
be established. Do not turn every sticky note into a confirmed scheduled event.
For interactive navigation, Web SDK `viewport.zoomTo(items)` or `viewport.set()`
can focus the chosen items/rectangle; neither method produces an image.
[Viewport reference](https://developers.miro.com/docs/websdk-reference-viewport).

## Rebuild calendar boards

**Calendar built from ordinary objects:** REST supports shapes, text, cards,
stickies, frames and other documented types. Read text, geometry and style, map
calendar cells to dates, then recreate supported objects in Miro or build an
HTML/SVG calendar in Tech NYU. Exact fonts, layering and unsupported objects need
visual comparison. Miro's own SDK tutorial creates an editable month grid from
shapes; there is no need for a special calendar object for that approach.
[REST support matrix](https://developers.miro.com/docs/miro-rest-api-introduction),
[calendar tutorial](https://developers.miro.com/docs/building-a-calendar-app-in-miro).

**Native Table / Timeline / other format:** the REST matrix explicitly marks Table,
Timeline and Grid CRUD unsupported. The list-items endpoint includes a
`data_table_format` enum, but that does not establish row/cell read/write support.
Do not promise a native calendar-format round trip from REST alone.

**MCP alternative:** `canvas_search` discovers board content;
`canvas_read_as_svg` returns structured SVG with stable `data-miro-id` identifiers.
Canvas tools support typed tables and table/grid/timeline/kanban views. Read the
current composer specification before writes; `canvas_update_from_svg` applies
diffs that can include deletion. Dedicated `table_list_rows`/`table_sync_rows`
remain listed but are marked for future deprecation. Verify support for the exact
calendar widget; a calendar view is not explicitly promised by that views list.
This SVG representation may require interpretation rather than direct rasterizing
and is not guaranteed to reproduce every board object visually.
[Current tools](https://developers.miro.com/docs/miro-mcp-tools),
[removed legacy tools](https://developers.miro.com/changelog/legacy-mcp-board-tools-have-been-removed).

## LLM representation for the confirmed ordinary-object calendar

The user confirmed the calendar uses shapes, text, cards and sticky notes. These
are supported REST types; native Table/Timeline support is no longer the primary
uncertainty for this board. Actual board contents have still not been inspected.

Proposed representation has three complementary layers:

1. **Original objects:** preserve every available API field, original rich text,
   card descriptions/links, IDs, source timestamps, styles, dimensions, rotations
   and parent relationships. Exhaust pagination and retrieve typed details or
   related resources as needed. Include connectors/tags/groups if used and exposed;
   do not assume listing generic items alone collects every relationship. Referenced
   external documents are separate sources whose full content is not fetched by
   reading a card URL. Preserve original data alongside normalized text.
2. **Spatial relationships:** normalize coordinates and describe month/year
   headings, day cells, enclosing shapes, overlapping/multiday events, legends and
   associated notes. Keep explicit API parentage separate from inferred geometric
   containment, and retain the objects used as evidence for each relationship.
3. **Calendar interpretation:** generate event-oriented records and readable
   month/week views with references to contributing source IDs. An inferred date,
   color meaning or note association must carry its evidence and ambiguity; a card
   due date is not automatically a calendar event start time. Do not discard the
   original spatial representation after interpreting it.

For LLM retrieval, a board overview guides smaller context requests. Reading an
event should also retrieve its date headings, related notes, legend and relevant
neighboring objects, including dependencies outside the cropped region. An
individual sticky-note text match is insufficient. Provide an option to inspect
raw objects and expand the region when interpretation is uncertain. This can be
live/on-demand; permanent database storage is not required by the approach.

Optional regenerated SVG/HTML views or browser snapshots let a multimodal model
cross-check layout. Compare one full frame with the original, reconcile object
counts/IDs, flag unsupported/unreadable objects and unresolved links, and test
questions involving date placement, color legends, notes and multiday events.
Handle edits during pagination with a best-effort reread; do not claim an atomic
board snapshot. Passing these checks would establish measured coverage, not a
guarantee that a model understands every human convention. Literal zero context
loss cannot be promised before board inspection or from API data alone.

Additional references: [individual item read](https://developers.miro.com/reference/get-specific-item-1),
[cards](https://developers.miro.com/docs/card-1),
[connectors](https://developers.miro.com/docs/connector_intro).

## Proposed Tech NYU proof of concept

1. Identify one real calendar board/frame, the owner's plan and its object types.
2. Read that frame and compare extracted content/object coverage with the visible
   original. Test native tables through MCP if REST cannot retrieve the content.
3. Normalize source board/item IDs, original links, raw content, dates/times,
   America/New_York assumptions, extraction confidence and last successful read.
   Gate access to snapshots and derived records just like the source content.
4. Reconstruct one month/week in the app with links back to Miro. Use a generated
   view for filtering and assistant questions; add exact visual captures only if
   the product needs them. Keep inferred dates separate from confirmed values.
5. If future writes are requested, map source event IDs to destination item IDs
   for idempotent updates and define ownership/conflict/deletion rules first.

For repeatable backend sync, REST is the preferred starting point for supported
objects. MCP is worth testing for native formats. Screenshots can supplement the
structured source; they should not be the only calendar record. Export/download
and cached derivatives require their own access enforcement; a cropped view or
frame is not a new permission boundary. No refresh schedule or sync direction
has been selected, and no live feasibility result is claimed.
