# Miro operations behind the private API

Model-facing descriptions, parameter guidance and returned instruction notices are maintained under root `prompts/tools/`; these modules keep fixed references, structural schemas and service behavior.

`contracts.js` declares the three operations. `index.js` checks current board,
team and source access, selects fixed official MCP reads and rechecks access
before returning content. Existing `mcp-client.js` performs provider calls.
`responses.js` validates MCP envelopes and citation URLs and supplies fixed safe
failure messages. `svg.js` parses inert SVG into native content identities without
executing markup or fetching resources. `fragments.js` bounds large JSON output
with content hashes and continuation offsets.

The thin `tools/miro/mcp.js` client reaches this service through the private
operation API. Backend helper consumers should import this folder directly.
Preserve native board/item/row identities, current-source checks, team checks,
quota privacy, fragment boundaries and navigation-only versus content evidence.
No Miro writes or new source grants are exposed.
