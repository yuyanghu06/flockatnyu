# Discord image context

Goal: let Flockbot understand image attachments in its invoking message, direct reply and bounded preceding-hour context. The web service fetches current authorized originals, downloads supported images in memory and passes them through the existing multimodal planning and answer path. No archive, schema, collector transport or source permission expansion.

Completion requires bounded native-CDN reads, explicit provenance/partial coverage, post-read source verification, independent end-to-end payload/privacy/regression checks, review and accurate release status. Current implementation and evidence live in the rolling milestone; deployment is separate from local acceptance.

Status: local implementation complete and independently accepted.391regressionchecks pass; configured-model full localpipeline recognizes synthetic image content in both phases. Scoped package verification passes. Hosted deployment remains pending Railway platform outage and local CLI authentication; follow rolling snapshot for actual release state.

The 2026-10-22 combined release supersedes earlier local-only or blocked status: all four Railway services report SUCCESS, reviewed migration 036 is applied, all 27 portraits are verified, and the working-tree features are published in logical GitHub commits. See the rolling milestone and combined-release receipt for the checks and limitations. Saved future ideas and unrequested business mutations remain separate.
