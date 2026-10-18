# Fixed map building catalogue

Complete: hosted022(receipt20261017202855) enforces map_buildings runtime SELECT plus UPDATE(people_here) only. IDs, names, aliases, directtimestamp edits and row insert/delete/truncate/upsert are denied. updated_at remains internally maintained by the existing validation trigger; owner catalogue maintenance is separate.

Verified:11new independent actualSQL checks,26existing roster/schema checks; primary standardcommand37/37 and API build. Independent evaluator ACCEPT. Hosted effective grants/receipt hashes match; actual service-role mutation probes rolled back,26people/9buildings/fiveBobst fixtures and prior publicfunctions/other table metadata preserved.

No new agenttools, schema tables/functions, frontendstyle changes or deployments. Future map tools must preserve this boundary. See docs/map-presence.md and evidence/map-building-write-scope/. Localdebug4187/API3127 restored under primary session58653 after specialist session ended; old5173/3001 preserved.
