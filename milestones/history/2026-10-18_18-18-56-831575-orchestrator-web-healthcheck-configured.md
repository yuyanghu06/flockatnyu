# Web health check configured for future deployments

- Local timestamp / acting role / milestone: 2026-10-18T18:18:56.831575-04:00 / orchestrator integrating specialist configuration report / live recovery.
- Requested scope: prevent failed web startup receiving production traffic after the password-validation incident.
- Starting repository state: current webfa9079healthy; source deployment/web/railway.json specifies healthcheck, but actual serviceInstance healthcheckPath/timeout were null. CLI environment edit silently reported no changes and did not set those legacy service-instance fields.
- Work performed / changed files: specialist verified official GraphQL schema/API and updated only actual web serviceInstance healthcheckPath=/healthz and healthcheckTimeout=60. No source/config-file edits in specialist pass.
- Decisions: configuration-only update; do not restart/redeploy healthy website during worker verification. Future rollout gate, not a continuous uptime probe.
- Checks and evidence: serviceInstanceUpdate true, readback exact /healthz/60. Latest deployment remains identicalfa9079b3-4e52-43d2-9f46-bc1da1350706 SUCCESS with unchanged creation time. No variables, credentials, sources, MCP settings or code changed. Official documentation https://docs.railway.com/integrations/api/manage-services and https://docs.railway.com/deployments/healthchecks.
- Resulting state / acceptance: intended health gate now persisted for future deployments; current healthy site unchanged.
- Remaining work and handoff: confirm corrected worker real completion/cache deletion; final evidence/journal publication. No failed deployment was deliberately triggered for this check.
