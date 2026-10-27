# Separate enrichment service deployment

These files package only the independent Contacts-cache/Treg enrichment runtime. Dockerfile installs production dependencies from its generated minimal manifest and runs as the node account after the exact private /data mount is secured. entrypoint.sh prepares only its own /data/treg-calls directory for private full-call logs. railway.json defines service build/restart behavior.

Use scripts/prepare-gmail-enrichment-deploy.mjs to create a reviewed temporary source-only upload context. No email data, env values, logs, migrations, UI, collector or planner is uploaded. A private persistent /data volume and configured token/database/service settings are prerequisites; creating these files does not deploy or activate it.

Production schedule is `0 13,14 * * *` UTC with restart NEVER. The entrypoint runs the finite scheduled command; only New York 09 triggers a backlog drain, and the other DST candidate exits. Private token configuration is required for actual processing.
