# Update agent Miro and Calendar

Goal: each eligible update-agent processing batch reads fresh authorized Miro context and can reconcile supported events in the explicitly configured Tech fall26 Google Calendar.

Scope: fixed-target Calendar client/tools, optional OAuth consent, trusted default adapters, mandatory per-batch preparation, bounded read results, prompt, tests and source/target access verification. Preserve queue cadence and current limits. No schema changes, Miro writes, Gmail sends, broad shared Calendar writes or frontend changes.

Completion requires independent tests/review plus truthful access evidence. Runtime deployment/activation and a complete scan of large boards are separate from bounded per-batch live context reads. Status: local implementation/testing/evaluation accepted (25new/79automation/55Google-Miro and API build). User completed Calendar OAuth consent; target access still404. Owner must grant app account event editing before operational acceptance. Worker inactive.

User deferred operational Calendar activation while waiting for owner access; preserve implementation and resume only when access is available or requested.
