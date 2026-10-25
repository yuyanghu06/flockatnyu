# History storage and read reuse options researched

- Local timestamp / acting role / milestone: 2026-10-25_17-18-06-106697 America/New_York / researcher / planner-throughput-fix-2026-10-25.
- Authorized scope: user requested saving/repeated-read fixes and a larger batch so planner keeps up.
- Work and evidence: Read-only source/schema investigation accepted. Compression of executionHistory alone preserves catalogue fields, exact logical snapshots and SQLchecks. Strict codec must reject corruption/trailingbytes/unknownencoding/expansion, validateexactbytecount/hash/UTF8/array. Physical256KiBwirecap stays. Existing1MiBfragment/runnerlimits requireexplicitpagedhistoryretrieval. No permission-bypassingreadcache: carry already returned observations into follow-up and keep ordinary fresh reads/write checks.
- Result/handoff: preparation accepted; code/testing/review/release remain pending. No live changes in this pass.
