# Shared live Miro tools

mcp.js supplies list_miro_boards, read_miro_board and read_miro_item to both agents. It uses official MCP search, inert canvas SVG and native table row reads. Registry/board/team/source scope is checked before and after retrieval. Search/catalogue/frame metadata cannot authorize writes; real event objects and stable native row identities can. Large JSON output uses bounded hash-checked continuations. The old REST tool implementation is removed; historical SQL-only fixtures are isolated under tests/fixtures/retired-miro-rest.

Empty search handling: verified zero matches with absent/null results are successful navigation, not failures or evidence of no events. Positive missing results and contradictory cursors fail closed. Date navigation searches exact month/year areas before reading returned matching frame canvases; overview can omit current month IDs.

Calendar navigation verifies spatial section identity and actual grid headings; repeated months and conflicting copied years cannot be resolved from frame titles alone.

Invalid request feedback uses fixed schema/canvas/table correction hints without echoing arguments. Canvas omits limit/cursor; table omits scope/itemIds. Strict rejection and zero upstream calls for incompatible options remain unchanged.

MCP unpacking validates envelopes/content/text/object JSON before exposing source context. Malformed provider data becomes invalid_mcp_result, distinct from explicit upstream tool_result_error; this prevents transient-outage handling from masking malformed content.

Quota and governor failures retain only the fixed quota_exhausted,
budget_exhausted, reconciliation_deferred or quota_state_unavailable status,
a canonical UTC retryAt when present, and fixed explanatory notices. They carry
no source facts or board content and cannot establish absence or synchronization.
Current registry/source access is rechecked even on these failed provider reads;
private upstream text and upgrade links never reach the agents.
