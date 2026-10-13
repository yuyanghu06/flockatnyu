# Hosted Discord policy and scoped reset

- Timestamp / role / milestone: 2026-10-11T16:56:37.686927-04:00 / orchestrator / M18.
- Scope: Explicitly authorized clear/rebuild of Discord archive with category/channel blacklist, noimages/embeddings.
- Startingstate: Acceptedlocal132test/evaluatorreview; Railwaycronnull andstoppedworker;10212oldDiscordoriginals.
- Work: AppliedSQL003 viaSupabaseMCP, configuredpausedpolicy with4category+1channelexclusions, executedguardedscopedreset, verifiedzerooriginal/revision/bucket/cursorrows andpreserved1operator/1channelconfig/0sourcegrants. Resetincrementedrevision2. Unpausedmanualcollectionpolicyrevision3, preservinglists; Railwaycronstilloff. Discovery nowrunningmetadata-only.
- Checks: Hosted17tablesforcedRLS,0browserreadable. RuntimeCLIpolicy/reset/unpause allreadyexit0. NootherDiscord/nonDiscordsources/genericdocuments existedbefore reset; no unrelateddata deleted.
- State: Oldarchivecleared; replacementdiscovery/backfillstillpending. Noimages/modelcalls/newdeploymentyet.
- Handoff: Completeboundeddiscovery/fullhistory/classification, independentlyverifyhostedinvariants anddeployworker before restatingschedule.
