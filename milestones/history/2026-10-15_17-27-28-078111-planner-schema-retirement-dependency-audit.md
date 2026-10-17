# schema retirement dependency audit

- Local timestamp / acting role / milestone: 2026-10-15_17-27-28-078111 / planner / M28 read-only assessment.
- Requested scope: Explain removable Miro columns and obsolete Discord/knowledge tables after the data-structure swap. No deletion instruction.
- Starting repository state: M25live-first summary pipeline active; M27schema/job applied but authorizationpending; dirty concurrentworkspace preserved.
- Work performed / changed files: Actual specialist table_schema_audit inspected001–012 and API wiring. Proposed9Discord+2knowledge candidates, plus3unusedgenericdocument scaffold tables for14total. Sevenpopulatedlegacy summary/accounting/provenance tables retained.
- Decisions: Cleanup proposal only.14table target includes deliberate retirement of genericdocument APIs;11table narrower option keeps that scaffold. Retain20tables including7legacy data/provenance and2sharedsourceACL tables. No CASCADE/drop or earliermigrationrewrite.
- Checks and evidence: Read-only source/function inventory; no currentAPI injection of genericdocument repository. Preservesharedvalidators and rewrite5retainedRPCs. Freshread-only evidence/schema-cleanup-audit/schema-inventory.json; currentactiveprocessing counts maychange.
- Resulting state / acceptance: Assessment accepted after independentreviews; existingfunctions still reference candidates, so implementation requires a newmigration+codecleanup+regressions.
- Remaining work and handoff: If cleanuprequested, preserve allretaineddata/permissions/vectorhashes/receipts and test livepolicy/status/discovery/summaries/MiroACL. Mirocolumn simplification also needs RPC/readerchanges, not rawcolumn drops.
