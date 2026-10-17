# Live Discord retrieval and fallback plan

- Local timestamp / acting role / milestone: 2026-10-15_16-11-30-438394 / actual planner specialist, root journal / M25/M26.
- Requested scope: Summary-only Railway pipeline, embedded stored summaries, live-first Discord chat tools, and prepared Google Gmail/Drive connector.
- Starting repository state: Dirty M23/M24 preserved; existing archive+summary services remain active. Current chat sourceUUIDlist empty; localoperator access needs explicit capability, productionauth remainsdenied.
- Work performed / changed files: Read-only live_discord_plan specialist inspected current botclient, sourcepolicy, app/provider. Proposed live search/read/window tools with existing guild+exclusions, explicit localoperator capability, no sourcegrant wildcard/productionmembergrant, bounded result contexts and fixedGETendpoints. Official Discord docs show guildsearch; actual bot compatibility awaitsread-onlysmoke. User clarified liveDiscordFIRST for channel/time summaries, Supabase fallbackonly after liveunavailable/incomplete and never afterpermissionsdeny. No edits/externalcalls. Root serializes journal only.
- Decisions: Rootowns sharedAPI/provider/package/deployment/env/docs/journal; exclusivecoders own summarynamespace+011, newliveDiscordmodules, and newGooglemodules/OAuthCLI. No overlapping sourceownership.
- Checks and evidence: Planner source/documentationinspection only; root Railwayread-onlyinventory finds tech-nyu project with discord-archive and discord-summaries services. Root officialOpenAIembeddingdocs confirm text-embedding-3-small1536 and8192tokenlimit. No test or cloudrolloutclaim.
- Resulting state / acceptance: Bounded planaccepted; implementation delegated with independenttesting/evaluation required before hostedcutover.
- Remaining work and handoff: Implement,test,evaluate,applyreviewedadditivemigration/deployverifiedworker,backfillexistingvectorsandverifycleanup. Googleauthwaitsuser; no secrets inrepo/docs.
