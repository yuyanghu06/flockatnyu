# Miro daily worker deployment

This Dockerfile runs only the native Node modules under server/miro as a one-shot
Railway cron service. scripts/prepare-miro-deploy.mjs constructs a fresh allowlisted
upload directory with this Dockerfile, those modules and a minimal ESM manifest.
No dependencies, other backend work, source assets, migrations or secrets are
copied. Runtime credentials belong in Railway variables. The primary agent owns
service configuration and deployment; worker code is owned under server/miro.

The scheduled command checks UTC10/11 candidates and syncs only at6AM America/New_York. No HTTP server or health check; restart NEVER. MIRO_SYNC_ENABLED remains false until explicit board scope and server token are configured.

M28 final image supports the12column data JSONB schema and shared source access
without per-person memberships. It remains disabled with no token/board scope;
see evidence/m28-schema-cleanup/railway-final.json for the final successful build.
