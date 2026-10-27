# Retire old reads after saved tasks close

Goal: finish the user-authorized cleanup of unused model conversation entries. The current compactor removes closed task views but can retain unique Discord, Calendar, map and identity read bodies belonging only to those closed tasks.

Scope: retire successful follow-up read bodies only after every exact bound task has successfully closed. Keep reads needed by any disclosed unfinished task, mixed or unknown bindings, queue history, failures, post-resolution readback, fragments/history pages, action receipts and all private backend evidence. Do not change prompts, limits, tool readers, schemas, live services or diagnostic-log retention.

Acceptance: meaningful production-runner simulation proves closed-task reads stop accumulating and shared/open/failure/write/fragment evidence stays intact; focused existing checks and API build pass; independent verification and evaluator ACCEPT. No model calls are required for this deterministic cleanup.

Status: bounded code/test/guide changes implemented and frozen; coder40focused checks pass. Independent probe passes five groups, reducing a synthetic354265byte conversation to4512bytes. Independent tester ACCEPT:180focused checks, five probe groups, APIbuild and whitespace pass. Final evaluator ACCEPT. Published as425fda5, remote main verified; verified runtime used for remaining manual work. Root owns journals/integration. Manual runner stopped cleanly between cycles while this correction was verified. The cycle25 receipt reports context_limit but cannot identify the exact cap; the separate private execution-log ceiling remains unchanged. The live worker has not been redeployed.
