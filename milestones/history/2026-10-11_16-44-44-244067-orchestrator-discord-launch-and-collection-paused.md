# discord launch and collection paused

- Local timestamp / role / milestone: 2026-10-11T16:44:44.244067-04:00 / orchestrator / M17→M18.
- Requested scope: Authorized Discord launch, then automatic discovery/blacklist and archive rebuild.
- Starting state: Existing uncommitted M16/M17 implementation on codex/dev; prior snapshot still reported access denial.
- Work and evidence: Live single-channel full history completed: 10,212 messages, earliest 2024-02-04; Railway Docker deployed and hosted sync passed. User now requests all-channel discovery with inherited exclusions, Discord-only reset/rebuild, time-tier originals, no images or embeddings. Cleared Railway cron through authenticated public API; CLI readback cron=null,next=null, latest deployment SUCCESS/stopped=true. No replacement reset has occurred yet.
- Decisions: Secrets remain private; reset only Discord guild archive, preserve unrelated Supabase data. Exclude category IDs 1461311169586266165, 1533053124606955600, 1203562092213305371, 1203562092376891445 and channel 1203562091982622819 with descendants. No image attachment storage or model calls.
- Resulting state: Historical launch successful; Railway collection now paused; M18 replacement implementation pending.
- Remaining work / handoff: Implement, test/review migration, apply policy, reset/rebuild eligible channels, verify time buckets and deployment.
