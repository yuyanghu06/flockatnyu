# Private model audit and safe diagnostics

`model-audit.js` records permitted returned model outputs and operational outcomes in private service-only audit storage. `serialization.js` collects configured secret values and redacts nested output before applying byte limits. Its traversal, embedded-JSON handling and redaction-before-truncation order are privacy boundaries.

`diagnostics.js` classifies safe fixed outcomes and counts, and preserves the existing diagnostic exports. `diagnostic-codes.js` owns the append-only numeric dictionaries; never reorder existing labels because stored numeric IDs depend on their position. `argument-diagnostics.js` inspects only declared schema fields and never exposes unknown user-supplied property names. `maintenance.js` schedules the existing private audit retention cleanup.

No module here provides public/model-facing audit retrieval or logs prompts, uploads, source-tool bodies or credentials. Preserve failure behavior: required audit writes can stop dispatch, while an optional diagnostic sink cannot change an operation's result.

`planner-spend-report.js` summarizes only private model-call/lifecycle metadata into cost, usage and outcome counts for operator reviews. It excludes diagnostic/chat/local-test and other-host spending, preserves unknown costs and never treats operation counts as unique or correctly completed tasks. It has no network or mutation behavior.
