# Raw-only sender cache correction recorded

- Local timestamp / acting role / milestone: 2026-10-26_18-45-19-244952 / orchestrator / gmail-cache-enrichment.
- Requested scope: user corrected the pipeline: store raw enriched contacts only in Contacts; contacts_cache is only for original unenriched contact input. Do not save the full enrichment back to the cache.
- Starting state: previous local050/worker implementation cached complete envelopes under _treg_enrichment. It was accepted locally but never applied/deployed.
- Checks/evidence: read-only hosted metadata confirms no contacts_enrichment_state, zero gmail_enrichment RPCs and zero cache rows containing _treg_enrichment. No production cleanup or rollback is required.
- Decisions: cache is read-only for enrichment service, including processing status; retain original input rows unchanged. Separate operational records may hold only leases/request IDs/spending/retry/completion metadata, not enrichment payloads. Atomic Contacts insertion plus completion tracking replaces the cache-save-first path. Existing full private Treg call logging remains the explicitly authorized debugging exception. No Gmail provider/UI/collector changes.
- Work/handoff: independent planner redesign assigned. Revise only unapplied050 and owned worker/adapter/tests; preserve applied047/049, existing Contacts/human edits, and all unrelated user changes.
- Result: correction recorded; implementation in progress, not yet verified. No paid lookup/live write/schema application/deploy/restart.
