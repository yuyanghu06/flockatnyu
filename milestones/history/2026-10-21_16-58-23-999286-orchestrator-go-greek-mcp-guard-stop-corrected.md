# Go Greek MCP preflight guard stopped an inconsistent digest encoding

- Acting role: ephemeral CLI migration operator, supervised by orchestrator.
- A read-only preflight recomputed catalogue MD5 using jsonb_agg rather than the specified string_agg encoding. The guard correctly stopped before any apply_migration call; no mutation occurred and data drift was not established.
- Orchestrator corrected the bounded instruction to require the exact original SQL/hash expression. No guard was relaxed, existing state overwritten or uncertain mutation retried.
- The corrected exact query matched the original nine-row catalogue and authorized the already-reviewed isolated037 operation. Actual application receipt belongs to the next pass.
