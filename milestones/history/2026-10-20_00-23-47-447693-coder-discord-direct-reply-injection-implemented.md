# Discord direct reply injection implemented

- Local timestamp / acting role / milestone: 2026-10-20T00:23:47.447693-04:00 / coder / Discord replied-message context.
- Requested scope: inject exact native replied-to message for the current bot request.
- Starting repository state: 346d24b live; bounded planner contract accepted. Final optional field name is repliedMessage (supersedes root's earlier reply shorthand).
- Work performed / changed files: Implemented fetchReplyContext via existing policy-checked live service, web bridge approved actor plumbing, optional strict discordContext.repliedMessage and both-phase quote prompt. Exact trigger and direct target are freshly read; full text up to 10000 characters, older references, explicit partial/unavailable and abort behavior. Source, identity and audience boundaries remain. Updated owned server/Discord guides.
- Decisions: live request memory only, full bounded originals as quoted facts, no collector protocol or public message changes.
- Checks and evidence: 139 focused tests, API build and diff checks passed. Code frozen.
- Resulting state / acceptance: implementation locally accepted; hosted old-release omission confirmed.
- Remaining work and handoff: finish independent testing/model/integration checks, deploy exact reviewed web source, verify promoted native reply block and publish journal.
