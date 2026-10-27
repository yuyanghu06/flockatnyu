# Planner standalone presence correction

The user requested diagnosis and then a fix for a missed clear location report. The planner originally over-deferred it as existing-event participation and consumed follow-up turns reading history.

Completed scope: prompt distinguishes standalone current presence, same-speaker departure and exact originating source/time, prevents later acknowledgements from reissuing old reports, and corrects a saved task on the same new version before action/sync/resolution. Additive052 appends eLab to the fixed existing building without other catalogue changes. Backend permissions, completion proofs, budgets and isolated tool operations remain unchanged.

Actual configured-model tests using production runner/adapters and simulated sources/storage cover original creation, large-history saved-task recovery, default expiry and unmatched identity. Deterministic checks cover outage/unknown location/human data plus full schema migration preservation. Exact reviewed worker-only release is live and independently accepted; hosted alias and unchanged other-building hash verified. Current release IDs, evidence counts and limits live in the rolling snapshot.

Requested implementation/release is complete. The specific actual report has not been observed retrying on the live map. Owner post-migration trigger/grant metadata reread was unavailable after MCP OAuth expired; successful transactional migration/full-schema tests and REST readbacks are recorded separately. Pre-existing audit-retention pruning remains a separate maintenance issue.
