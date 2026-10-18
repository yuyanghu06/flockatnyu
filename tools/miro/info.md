# Shared live Miro tools

mcp.js supplies list_miro_boards, read_miro_board and read_miro_item to both agents. It uses official MCP search, inert canvas SVG and native table row reads. Registry/board/team/source scope is checked before and after retrieval. Search/catalogue/frame metadata cannot authorize writes; real event objects and stable native row identities can. Large JSON output uses bounded hash-checked continuations. The old REST tool implementation is removed; historical SQL-only fixtures are isolated under tests/fixtures/retired-miro-rest.

Empty search handling: verified zero matches with absent/null results are successful navigation, not failures or evidence of no events. Positive missing results and contradictory cursors fail closed. Date navigation searches exact month/year areas before reading returned matching frame canvases; overview can omit current month IDs.

Calendar navigation verifies spatial section identity and actual grid headings; repeated months and conflicting copied years cannot be resolved from frame titles alone.

Invalid request feedback uses fixed schema/canvas/table correction hints without echoing arguments. Canvas omits limit/cursor; table omits scope/itemIds. Strict rejection and zero upstream calls for incompatible options remain unchanged.
