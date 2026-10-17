# live catalogue race and runtime integration

- Local timestamp / acting role / milestone: 2026-10-15_20-38-07-785783 / orchestrator / M29.
- Requested scope: Delete all durable Discord summaries/accounting and keep only one catalogue/view policy table; all content read live through bot.
- Starting repository state: M28applied001–016,19tables and summary worker. Explicitnewuserdirection supersedes oldretentionrequirements. Concurrentdirtyworkspacepreserved.
- Work performed / changed files: Root removed scheduled-summary npm scripts, changed Docker default to metadata discovery, isolated historical001–016adapters in test-only fixtures, corrected tool descriptions, and closed same-revision catalogue withdrawal/remapping race by finalcataloguerecheck. Summary service removed from production after securely materializing dependent database values. Hosted017applied; verification underway. No provider calls.
- Decisions: Keepdiscord_view_policies,knowledge_sources,miro_boards only; removeDiscordsource duplicates afterstableIDs captured. NoCASCADE/oldmigrationrewrite/Mirochanges. Preserve sourceallowlist/exclusions/admin and final livecataloguechecks.
- Checks and evidence: Independenttest/evaluatorresultsabove; evidence/m29-discord-live-only/ localreport/log and sanitizedcloudreceipts. Historicaladaptertests remainbounded andexcludeddeployment.
- Resulting state / acceptance: Localimplementationaccepted; hosted017applied with livebotreadsmokesuccess; finalpreservation/buildreadbackpending.
- Remaining work and handoff: Verify exact3tables/catalogue/policy/checkpoints/nonDiscordfingerprints/ACL, finalmetadataimage andserviceabsence; refreshguides. No model calls or Discord posts needed.
