# Planner runtime independently measured

- Local timestamp / acting role / milestone: 2026-10-25_16-55-11-353478 America/New_York / tester / planner-throughput-2026-10-25.
- Requested scope: diagnose two-input batches and slow current planner throughput.
- Work, checks and evidence: Independent offline tester PASS using tester-analyze.py, exit0. Complete cohort11runs,7completed/3preflight/1roundlimit,20claimedattempts/13ack; median157.645s. Timings tools52.34%,model26.09%,prepare1.42%,unclassified20.15%;Discordmessage64calls518.899s,median7.553s;allDiscordtools33.04%;sync10calls125.921s7.14%.172modelsall200. Fourzeroackruns33.15%runtime. Storage-save rejections4:33/4:40;generic4:38causeunknown. ElapsedMs sorting resolves buffered timestamps;zero pairing errors/overlaps. Owned only ignored tester evidence;no network/model/business/source changes.
- Result and handoff: bounded diagnosis accepted; see ../planner-throughput-2026-10-25/info.md. No implementation or tuning performed.
