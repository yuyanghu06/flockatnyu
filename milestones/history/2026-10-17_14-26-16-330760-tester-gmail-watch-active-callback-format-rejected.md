# Gmail receiver live; callback rejection requires fix

- Local timestamp / acting role / milestone: 2026-10-17_14-26-16-330760 America/New_York / independent tester and root integration / M35.
- Scope: verify deployment, health, authentication, watch checkpoint and signed Pub/Sub delivery.
- Work: deployed secret-free reviewed snapshot94e195f7-cf24-4b46-aefc-238d035012cb to only new gmail-events Railway service. Server secrets passed via stdin, never logged. Collector enabled; no LLM runner.
- Checks: independent tester confirms deploymentSUCCESS, health200, unsigned and forged-tokenJSON401. Runtimewatching and hosted ready checkpoint confirm initial watch active; expiration1792866230852. Cache0 and lastSyncAtnull at observation.
- Finding:97 POST/webhooks/gmail400 rows/no200 in100-row sample, consistent repeated notification rejection. Actual cause not established; no source bodies/credentials printed. Evidence: evidence/m35-gmail-subscription/live-tester-report.md and live-tester-checks.json.
- Decision: do not claim signed notification/email delivery. Gmail coder owns subscription modules for fixed-enumeration diagnostics and bounded format compatibility; no auth weakening. Existing service reconciles every5minutes while push rejection is investigated. No sends/model calls/other-service changes.
- Next: targeted fix/diagnostic deployment, independent test/evaluation, redeploy and signed-delivery verification. Prompt collaboration follows truthful completion notice.
