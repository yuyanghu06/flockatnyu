# Lossless task-history wire storage implemented

- Local timestamp / acting role / milestone: 2026-10-25_17-25-26-407305 America/New_York / coder-storage / planner-throughput-fix-2026-10-25.
- Scope: authorized task-saving/read-reuse implementation before batch increase.
- Work and evidence: Only task-store.js and newtask-history-codec.js changed. Preserve physical256KiBSQL limit and ordinarysource/request/originalfields; encodeoversizedhistoryvia strictcanonicaldeflate/base64/SHA256 with16MiBdecodedguard, readlegacy/plainandreturnexactlogicalarrays. ExistingactualPGlite/catalogue24pass;newindependentstorage20pass. Parentfoundobjectkeyorderidempotenceedge; coderfixedwithcanonicalJson andcombined44checks pass. No live changes.
- Result/handoff: sourceimplementationreadyforintegrated/actualmodeltesting; livebatchcapstill2 andno releaseclaimed. Concurrent frontend/map workpreserved.
