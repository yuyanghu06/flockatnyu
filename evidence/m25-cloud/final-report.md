# Independent final hosted M25 audit

- Milestone / role / scope: M25 / tester / bounded read-only follow-up of hosted summary-only storage, all currently stored summaries' embeddings and current Railway deployment. Initial audit files remain unchanged.
- Starting state and files inspected: Current instructions, prior independent audit/report, cloud evidence and accepted migration011. Root reported active Railway catchup and completed local vector drains. This audit independently repeated aggregate database and Railway readbacks rather than accepting those counts as proof.
- Work performed and changed files: Added `final-audit.json` and this report; extended `/tmp/tech-nyu-cloud-audit.sql` with missing-vector and nonempty-result aggregate checks. No implementation/shared-journal changes, cloud mutations, model/Google calls, message bodies, summary text or secret values.
- Decisions and assumptions: Outstanding closed-period jobs are ongoing automated catchup, separate from embedding coverage of summaries already stored. Separate SQL/status/Railway snapshots can differ as workers progress. A running manual invocation does not establish natural cron execution or a successful final exit.

## Executed checks and evidence

`python3 /tmp/tech-nyu-sql.py /tmp/tech-nyu-cloud-audit.sql --write` — exit0, with the complete SQL explicitly enclosed in `BEGIN READ ONLY; ... COMMIT;`. Snapshot: **2026-10-15T21:01:49.290839Z**.

| Check | Actual result |
| --- | --- |
| Durable raw Discord messages / revisions | 0 / 0 |
| Copied Discord knowledge documents / chunks / daily summaries | 0 / 0 / 0 |
| Summary-only switch / four retirement triggers | Enabled / all enabled |
| Legacy summaries / certificates / usage receipts | 722 / 722 / 2245 |
| Legacy summary fingerprint | `4dd4471d4d877a9c60cd94ab4cee2c6a`, baseline unchanged |
| Legacy receipt fingerprint | `f54b3cd94da5f37ca4110697ea604da8`, baseline unchanged |
| Policy | Revision3, unpaused; original four category exclusions and one channel exclusion unchanged |
| New-table security | All6 enable and force RLS; anon/authenticated denied; service read/write permitted |
| RPC security | All19 invoker; anon/authenticated execute denied; service execute permitted |
| Reader grants | 218 local-development only; zero writes or nonlocal grants |
| Stored summaries / ready vectors | 726 / 726: 722 legacy and4 live |
| Missing vectors / pending / running | 0 / 0 / 0 |
| Stale vector hashes / invalid ready dimensions | 0 / 0; every ready vector has1536 dimensions |
| New results | 4 monthly,0 weekly; all successful, closed calendar periods with valid hash/pages/empty flags |
| Nonempty new results | 3 monthly;2529 represented messages across27 pages |
| Original citations on nonempty new results | 204; no empty citation sets and no malformed/foreign original Discord URLs |
| Catchup jobs | 430 pending,2 running,2 failed,4 succeeded;434 outstanding |

The citation query checks every new citation's message-ID format and exact `https://discord.com/channels/<job-guild>/<job-channel>/<message-id>` match without returning private content. It establishes valid source identity/link structure, not semantic faithfulness of the summary to the source messages.

`node --env-file=.env server/discord/live-summary-cli.js status` — exit0, `status:ready`, raw0, summaryOnly=true, legacy722, new4, readyEmbeddings726, missingEmbeddings0 and pendingJobs434. This agrees with the independent SQL snapshot.

`railway status --json`, filtered in memory to project `f13799d2-95ff-4d22-9b17-acfce19406ca`, production and the exact two Discord services — exit0. Service overrides and each active deployment manifest agree:

- Metadata service deployment `46fc58c6-4219-47ea-aa00-37c8764a496a`: SUCCESS, instance EXITED; command `node server/discord/cli.js discover`; cron `0 10 * * *`; restart NEVER; no health check. Image digest `sha256:15536621fd1235cf23c9b77a63d5a49e85720e0ab6c3005c04236f5b14392cdd`.
- Summary service deployment **`28e3e78b-4832-4b08-b3af-65baeb331f0a`**: SUCCESS, instance RUNNING, matching the expected replacement deployment. Command `node server/discord/live-summary-cli.js scheduled`; cron `10 * * * *`; restart NEVER; no health check. Image digest `sha256:a0d83ae762394688da96c96af8d1ef3f0f4b9032b67132794fdc792868e0afdf`.

`railway variable list --project f13799d2-95ff-4d22-9b17-acfce19406ca --environment dfe169c1-46a0-415a-9171-309fc9974ef8 --service 69883843-95df-4d3b-9a16-e44983e1964e --json`, captured privately and filtered in memory to four nonsecret settings — exit0. Verified runtime3600000ms,1000 requests,50 groups and$1 run cap. No raw variable output was printed or retained.

## Verdict, remaining gaps and handoff

**PASS / ACCEPT for the observed hosted cutover, exact legacy preservation, current access boundaries, complete current-summary embedding coverage, nonempty monthly result/citation structure and replacement Railway configuration.** The initial incomplete embedding snapshot is superseded by this measured726/726 result, while the initial audit remains preserved.

The434 outstanding jobs are ongoing Railway catchup, not missing embeddings for existing summaries. This bounded pass does not require their completion. First new weekly publication, semantic summary accuracy, successful exit of the currently running replacement worker, future summary/vector counts as new results arrive, and a natural scheduled invocation remain unobserved. Metadata readback confirms the expected deployment and image identity; this audit did not independently reconstruct or inspect the container image's filesystem.

The orchestrator should record this acceptance and these limits in shared milestones/history and refresh cloud `info.md`. Continue catchup under the existing bounded worker and monitor operational receipts; do not describe the backlog or natural scheduler execution as complete. This assignment permitted no folder-guide/shared-journal edits.
