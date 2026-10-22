# Discord collector crash logging

Expose content-free failure stages and allowlisted machine codes for the Discord collector while preserving fatal handling, restart policy, permissions and durable checkpoint ordering. Completion requires independent crash/privacy regressions, deployment-package verification and a live collector startup marker. Current status lives in milestones/milestone.md.

Implementation209e106and independent verification are complete. Railway rejected the guarded27file upload because deployments are temporarily paused; live activation remains pending. Retry release and confirm versioned startup, Gateway readiness and checkpoint progress. Structured diagnostics sanitize known failure fields; native Node fatal stderr retains existing behavior.

User requires coordination after the other agent rollout. Itsc984237combined collector package already includes the logging helper and CLI byte-for-byte. Supersede the older logging-only deployment artifact; after the other rollout, verify diagnostics startup and deploy latest verified combined source only if missing. Railway remains paused as ofOctober21at12:50ET; no background deployment job was created.
