# discord discovery memory reviewed

- Timestamp / role / milestone: 2026-10-11T16:55:57.180473-04:00 / evaluator / M18.
- Scope: Authorized automaticdiscovery/blacklist, Discord-only reset/rebuild, originaldaily/week/month groups, noimages/embeddings.
- Startingstate: Localimplementationunderreview, Railwaypaused, originalM17dataretained.
- Work/checks: Independent99/99 broadDiscord tests andAPIbuild passed; reproduced andverifiedfixes forComponentsV2 andopaqueattachmentimageURLs. ReviewedlocalSQL003/reset/policy/discovery/calendar groupingaccepted. Hostedrollout notyetverified.
- Decisions: Preserveoperators/config/exclusions/ACL/nonDiscorddata; noautojoins/readgrants/modelcalls. Storagegroupsare originalrecords, notAI summaries.
- Result: Localreplacementaccepted; nohosted003/reset/replacementrunyet.
- Handoff: Applyreviewedmigration, storepausedpolicy, resetonlyconfirmedguild, discovery/fullbackfill/classification, validatehostedcounts/guards anddeploy.
