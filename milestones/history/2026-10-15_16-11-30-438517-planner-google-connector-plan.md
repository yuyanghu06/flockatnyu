# Railway Gmail and Drive connector plan

- Local timestamp / acting role / milestone: 2026-10-15_16-11-30-438517 / actual planner specialist, root journal / M25/M26.
- Requested scope: Summary-only Railway pipeline, embedded stored summaries, live-first Discord chat tools, and prepared Google Gmail/Drive connector.
- Starting repository state: Dirty M23/M24 preserved; existing archive+summary services remain active. Current chat sourceUUIDlist empty; localoperator access needs explicit capability, productionauth remainsdenied.
- Work performed / changed files: Read-only google_connector_plan specialist proposes officialgoogle-auth-library with bounded Gmail/DriveREST read-onlytools and server-sideOAuth. One-time loopback state+PKCE consent writes ignored0600envfile; RailwayrefreshToken persistssecretly later. AccountOAuthpendinguserclientcredentials/consent, APIkeyinsufficient. No email/filewrite permission requested. NativeGoogle APIs chosen for Railwayruntime; hostChatGPT/CodexMCPcredentialsareseparate. No contentreads or externalwrites. Root serializes journal only.
- Decisions: Rootowns sharedAPI/provider/package/deployment/env/docs/journal; exclusivecoders own summarynamespace+011, newliveDiscordmodules, and newGooglemodules/OAuthCLI. No overlapping sourceownership.
- Checks and evidence: Planner source/documentationinspection only; root Railwayread-onlyinventory finds tech-nyu project with discord-archive and discord-summaries services. Root officialOpenAIembeddingdocs confirm text-embedding-3-small1536 and8192tokenlimit. No test or cloudrolloutclaim.
- Resulting state / acceptance: Bounded planaccepted; implementation delegated with independenttesting/evaluation required before hostedcutover.
- Remaining work and handoff: Implement,test,evaluate,applyreviewedadditivemigration/deployverifiedworker,backfillexistingvectorsandverifycleanup. Googleauthwaitsuser; no secrets inrepo/docs.
