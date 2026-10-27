# Autonomous update worker

This continuous process consumes the existing bounded pending-input queue. It
has no HTTP endpoint or cron schedule. Runtime enablement and source credentials
are server environment settings managed independently from packaging.

`node scripts/prepare-runtime-deploy.mjs agent-worker` creates a temporary upload
containing only reachable server/tool modules and the default trusted adapter.
It includes no frontend assets, environment files, OAuth files or development
history. Custom adapter modules are deliberately absent. Persistent Miro token
ownership must be provisioned separately before declaring live sync ready.

Current production tuning uses2inputs per batch and600000ms under unchanged16round/32tool bounds. A same-image preceding5input batch completed successfully but used569325ms, so smaller batches leave edit headroom. Recognized Miro navigation outages are explicitly deferred without Miro evidence; actual authorization/config/malformed failures remain fatal.

Worker and web use the same PUBLIC_ORIGIN to authorize chat-declared attendance markers against their exact person/event and current original source. This preserves those participants during ordinary source-backed event merges without inventing provider identity or granting broader access. The nonsecret origin is runtime configuration; passwords/tokens remain private environment variables.

The worker image copies server, prompts and src/api. Its package has no tools root. The runtime packaging check projects these COPY paths and imports real adapters/handler with networking denied, so a source present only in the upload cannot masquerade as an installed image file. Deployment does not enable processing; the recorded rollout retains AGENT_AUTOMATION_ENABLED=false.
