# Private production website

The runtime serves the built frontend and existing assistant API on one origin.
Every page, asset and connected-source API requires a signed private operator
session. Only minimal health, the password sign-in page and exact read-only
/favicon.svg and /favicon.ico branding paths are public. The
password and session signing secret come exclusively from server environment
variables. Sessions do not grant administrator privileges or a member identity.

Required settings: `PUBLIC_ORIGIN` (the exact HTTPS site origin),
`SITE_ACCESS_PASSWORD` (at least 12 characters), `SITE_SESSION_SECRET` (at least
32 characters). Optional `SITE_SESSION_TTL_SECONDS` defaults to 43200. Source
capabilities require `SITE_GOOGLE_ENABLED=true` and/or
`SITE_DISCORD_ENABLED=true`, independently of local development flags. Shared
source allowlists and the configured Discord guild still restrict reads.

Prepare an isolated upload with `node scripts/prepare-runtime-deploy.mjs web`
after the frontend build. The generated context contains reachable server/tool
modules, pinned runtime dependencies and frontend build files, never local
environment, OAuth, Git, journal or evidence files. Railway variables and any
separately provisioned persistent Miro authentication remain operational setup.

The exact `/internal/miro/token` route uses a separate server bearer secret,
not the browser session. It is the worker's token broker. The web service owns
the sole persistent Miro OAuth refresh file on its writable volume; worker
uploads never contain that file and workers receive short-lived access tokens.

The explicit Railway start command invokes the image bootstrap. It validates /data and the exact auth file, fixes only their ownership/private modes, then execs gosu as node. Provision credentials separately after first launch and restart; verify actual UID1000 and modes on hosted runtime.
