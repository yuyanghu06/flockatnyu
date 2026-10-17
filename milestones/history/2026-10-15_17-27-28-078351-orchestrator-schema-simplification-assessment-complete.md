# schema simplification assessment complete

- Local timestamp / acting role / milestone: 2026-10-15_17-27-28-078351 / orchestrator / M28 read-only assessment.
- Requested scope: Explain removable Miro columns and obsolete Discord/knowledge tables after the data-structure swap. No deletion instruction.
- Starting repository state: M25live-first summary pipeline active; M27schema/job applied but authorizationpending; dirty concurrentworkspace preserved.
- Work performed / changed files: Parent inspected current Miro schema/uses, queried exact hostedDiscord/knowledge counts/FKs/triggers/function references read-only, reconciled independentreports and wrote docs/schema-cleanup-audit.md plus evidence/M28guides.
- Decisions: Cleanup proposal only.14table target includes deliberate retirement of genericdocument APIs;11table narrower option keeps that scaffold. Retain20tables including7legacy data/provenance and2sharedsourceACL tables. No CASCADE/drop or earliermigrationrewrite.
- Checks and evidence: Assertions verify34tables,14emptycandidates,0retainedinboundFKs. Recommended Miro27->12columns via15removals; preserve source/lease/configguards and rawpayload. No implementation tests needed or run; no code/schema/data/job modifications. Freshread-only evidence/schema-cleanup-audit/schema-inventory.json; currentactiveprocessing counts maychange.
- Resulting state / acceptance: Assessment accepted after independentreviews; existingfunctions still reference candidates, so implementation requires a newmigration+codecleanup+regressions.
- Remaining work and handoff: If cleanuprequested, preserve allretaineddata/permissions/vectorhashes/receipts and test livepolicy/status/discovery/summaries/MiroACL. Mirocolumn simplification also needs RPC/readerchanges, not rawcolumn drops.
