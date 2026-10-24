# Ordered provider fallback implemented

- Acting role / milestone: coder / provider fallback.
- Requested scope: private ordered provider URL/key configuration and shared model routing.
- Starting state: one-provider adapter; legacy settings and unrelated local changes preserved.
- Work performed / files: server/config.js,providers/index.js,retry.js,info.md and model-audit.js only. No external requests, deployment, credentials or business writes by specialist.
- Decisions: LLM_PROVIDERS_JSON validates1–8orderedentries; native protocol perentry; originaldeadline/context shared. HTTP401/402/403/404 and knowncredit/quota errors skip immediate; existing transientretry thennext. AnyHTTPsuccess, parser/stream errors, auditstart/localvalidation/abort preventfallback. Alllistkeysredacted. HTTP402 was a bounded final contract addition for payment rejection.
- Checks/evidence:185/185 relevant provider, protocol, attachments and auditchecks pass; APIbuild/diffcheck pass. Runtimehashes recorded in ignored frozen-scope.json. No tool/stage/round/output/timeout changes, package or schema additions.
- Resulting state: implementation frozen for review/integration. User supplied no backup account; no livebackup recovery claim.
- Handoff: evaluator and root own independent acceptance, environment guidance, package verification and release. Persistentpause, queue recovery and checkpointlimits remain separate.

Recorded 2026-10-24_08-17-15-982823 America/New_York.
