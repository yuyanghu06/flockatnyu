# live only runtime and job retirement

- Local timestamp / acting role / milestone: 2026-10-15_20-38-07-785781 / coder / M29.
- Requested scope: Delete all durable Discord summaries/accounting and keep only one catalogue/view policy table; all content read live through bot.
- Starting repository state: M28applied001–016,19tables and summary worker. Explicitnewuserdirection supersedes oldretentionrequirements. Concurrentdirtyworkspacepreserved.
- Work performed / changed files: Removed fallback from API/index/context/status and retired durable CLI/store/runner/embedder factories without network. Preserved live bot tools, source/admin controls and bounded RAM-only summarization. Active46/46/API pass; obsolete fallback assertion handed off and corrected.
- Decisions: Keepdiscord_view_policies,knowledge_sources,miro_boards only; removeDiscordsource duplicates afterstableIDs captured. NoCASCADE/oldmigrationrewrite/Mirochanges. Preserve sourceallowlist/exclusions/admin and final livecataloguechecks.
- Checks and evidence: Independenttest/evaluatorresultsabove; evidence/m29-discord-live-only/ localreport/log and sanitizedcloudreceipts. Historicaladaptertests remainbounded andexcludeddeployment.
- Resulting state / acceptance: Localimplementationaccepted; hosted017applied with livebotreadsmokesuccess; finalpreservation/buildreadbackpending.
- Remaining work and handoff: Verify exact3tables/catalogue/policy/checkpoints/nonDiscordfingerprints/ACL, finalmetadataimage andserviceabsence; refreshguides. No model calls or Discord posts needed.
