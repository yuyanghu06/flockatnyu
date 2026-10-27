# Runtime skills

This server-only folder activates domain guidance shared by chat and the autonomous planner. `drive.js` selects the fixed reviewed Tech@NYU Drive instructions in `../../prompts/tools/drive/navigation.md` through the prompt loader; external content cannot choose a path. Both orchestrators activate its full prompt before executing their first selected Drive call, then retain it for that request or batch. Discovery descriptions stay short for unrelated requests.

Source-only packages include the fixed Markdown assets referenced by their reachable modules. Private Drive inventory, document bodies, OAuth configuration and school-account credentials are excluded. Wording is maintained only in the root `prompts/` tree.

The Drive Calendar-copy guidance is explicitly chat-only and applies when the named chat tool is exposed. Workers cannot use create_calendar_events, and Drive content grants no autonomous Calendar/map write authority.
