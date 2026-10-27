# Deployment assets

Web and update-worker Docker recipes copy the root prompt assets. Collector preparation adds the same copy only when reachable modules reference prompts, preserving slim contexts without an empty required directory.

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

The former Miro collector is retired; chat and update agents use official live MCP directly.

Credentials belong in local ignored environment files or private Railway service
variables, never these folders or upload contexts. Migrations do not run at image
startup. Service IDs and actual launch/ingestion evidence live in the rolling
milestone and service guides.

Miro retirement: miro-worker deployment files/preparer and Railway miro-sync service are removed. Chat/update agents connect directly to official Miro MCP with separate application credentials; there is no Miro collector.

Web and update-agent use `scripts/prepare-runtime-deploy.mjs` sanitized reachable-module contexts. Web serves built frontend and API behind the environment-password gate; its persistent /data owns Miro OAuth. Worker uses the private access-token broker and reads official MCP directly. See docs/deployment.md.

`gmail-enrichment/` packages the independent opt-in contacts_cache/Treg/Contacts service. It uses a separate private /data volume for call logs and contains no Google OAuth/collector runtime. Schema and activation status are in the rolling milestone.
