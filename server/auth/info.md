# Website authentication

`site-auth.js` reads the existing private website authentication configuration, issues and checks signed operator sessions, and enforces the website's request-origin rules. Website passwords and session secrets come from private environment variables, never committed files or database records.

The website entry point uses this module while composing `server/runtime` and `src/api` routes. An operator session does not become a Discord administrator, source membership or manual-planner API key. Preserve those independent authorization checks.
