# read miro item

## description

<!-- prompt: description -->
Read actual Miro MCP content. type=canvas: omit limit/cursor; returns inert SVG containing the item plus surrounding calendar grid/date headings; itemIds can select several related notes together, or scope narrows a large frame. type=table: omit scope/itemIds; use limit/cursor. Reads native data-table columns and rows with stable rowId (use canvas for calendar grids). Follow table nextCursor or JSON fragment nextOffset/expectedHash without changing arguments. Only concrete content-backed sourceKey values authorize later writes; never use a frame/table identity for multiple events.
<!-- /prompt -->
