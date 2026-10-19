# Runtime skills

This server-only folder holds maintained domain guidance shared by chat and the autonomous planner. `drive.js` loads the fixed reviewed Tech@NYU Drive skill; external content cannot choose a skill path. Both orchestrators activate its full prompt before executing their first selected Drive call, then retain it for that request or batch. Discovery descriptions stay short for unrelated requests.

The runtime deployment packager explicitly includes the Markdown asset. Private Drive inventory, document bodies, OAuth configuration and school-account credentials are excluded.
