# read miro board

## description

<!-- prompt: description -->
Read live Miro MCP navigation: overview lists containers; mode=search finds related patterns (e.g. HP) together using resultMode=matches or areas. Search includes native grids/table content, but an empty date search does not mean no calendar events: dates may be separate day cells. For date questions, first search the exact month/year heading using patterns=["<requested month and year>"] and resultMode=areas (substitute the requested month/year), then verify the returned section and calendar grid with read_miro_item(type=canvas). Duplicate month labels can belong to different calendars; use live section headings and spatial bounds. Overview samples may omit required frames; repeated-title summaries have no IDs. Conflicting outer/inner years require corroboration; neither alone resolves the date. Search alone is not event evidence. Follow nextCursor and fragment continuations; no whole-board completeness claim.
<!-- /prompt -->
