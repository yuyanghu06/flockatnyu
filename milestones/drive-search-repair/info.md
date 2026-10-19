# Drive search pagination repair

Repair valid Google Drive search pages discarded because pagination cursors were assumed to use a base64 alphabet. Scope covers the shared read client, model tool schema and chat result projection. Keep existing account, source access, fixed endpoints, size limits and partial-coverage rules.

Complete when independent tests/review, live read-only search and exact continuation, runtime builds, promoted web/update-agent checks and publication pass. Current state: shared fix implemented, real failed queries and continuations pass, both builds pass; independent final checks and rollout pending. Orchestrator owns tracking and releases; private source data and credentials must not enter this journal.
