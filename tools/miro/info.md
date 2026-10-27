# Miro tool clients

`mcp.js` preserves the three Miro tool definitions and constructor, plus the
`miroSvgItems` helper export for existing callers. The constructor creates a client
for the private operation API. Backend code that needs the pure SVG reader should
import `server/miro/operations/svg.js` directly.

`server/miro/operations` implements authorized board navigation, official MCP
canvas/table reads, inert SVG parsing and bounded hash-checked JSON fragments.
Board/team/source checks, fixed failure notices and final access checks stay in
that backend folder. Navigation metadata never grants event-write permission;
only actual returned content can provide event identities. SVG remains data and
is never rendered or executed by these operations. The compatibility
`prepareBoard` method also uses the private read endpoint. No Miro writes exist.
