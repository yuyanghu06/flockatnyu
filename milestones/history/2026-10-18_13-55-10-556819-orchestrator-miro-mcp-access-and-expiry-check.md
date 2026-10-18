# Miro MCP access and expiry check

- Local timestamp / role: 2026-10-18T13:55:10.556819-04:00 / orchestrator.
- Scope: verify current access and explain expiration after screenshot failure.
- Starting state: live MCP cutover accepted, concurrent user work preserved.

Read-only follow-up to the failed weekly-events screenshot. Running API reports Miro configured. Three real protected HTTP reads (overview, October search and seven date patterns) all returned ready. A fresh real-model weekly-events planning request completed catalogue → overview → search → actual canvas within four calls; calendar content reached context with explicit partial coverage. The screenshot failure did not reproduce, and its original argument/error payload is unavailable, so no exact historical cause is claimed.

Private app credentials contain access and refresh tokens plus registered client information. The returned access-token lifetime is3553seconds (approximately one hour); this is the grant lifetime, not a remaining-time estimate. Existing SDK transport refreshes after authentication expiry and atomically persists rotated credentials; actual rotation was proven in the prior cutover. No token values were printed. Official MCP FAQ confirms team-scoped OAuth/current permissions and possible authorization supersession across team/client changes. Public REST documentation's60day refresh lifetime was not assumed to establish the MCP grant's exact lifetime. No permanent-login guarantee is made.

No implementation, credentials, source data, model configuration, schema or service settings changed in this pass. Only journal updated. Next: investigate exact safe tool failure code/arguments if the intermittent weekly search fails again; hourly access expiry should be handled automatically without user consent.
- Checks: real local API reads and bounded read-only model planning; no mutation or worker activation.
- Result: current MCP access verified; screenshot failure not reproduced.
