# Autonomous update worker

This continuous process consumes the existing bounded pending-input queue. It
has no HTTP endpoint or cron schedule. Runtime enablement and source credentials
are server environment settings managed independently from packaging.

`node scripts/prepare-runtime-deploy.mjs agent-worker` creates a temporary upload
containing only reachable server/tool modules and the default trusted adapter.
It includes no frontend assets, environment files, OAuth files or development
history. Custom adapter modules are deliberately absent. Persistent Miro token
ownership must be provisioned separately before declaring live sync ready.
