# Deployment assets

This folder contains reviewed deployment inputs for independent services sharing
one Supabase project. Discord and Gmail each have a service-only pinned manifest
and reproducible runtime lockfile, Dockerfile and Railway config. Their preparers
follow static imports from the service entrypoint and create fresh temporary
contexts; the campus map, main API and other connectors are excluded.

Use `node scripts/prepare-discord-deploy.mjs` for the continuous Discord event
collector and `node scripts/prepare-gmail-deploy.mjs` for Gmail's authenticated
callback/reconciliation service. Upload only the returned directory. Generated
contexts reject reachable symlinks, unexpected dependencies and dynamic loading,
and include exact-file Docker ignore rules. Startup/health/restart/no-cron
settings are explicit at the context root. Cloud deployment and configuration
verification belong to the orchestrator; preparing files is not deployment.

The separate Miro worker under miro-worker/ uses
`scripts/prepare-miro-deploy.mjs` to upload native Miro modules and a minimal
manifest. Its daily job is independent of Discord/Gmail collector work.

Credentials belong in local ignored environment files or private Railway service
variables, never these folders or upload contexts. Migrations do not run at image
startup. Service IDs and actual launch/ingestion evidence live in the rolling
milestone and service guides.
