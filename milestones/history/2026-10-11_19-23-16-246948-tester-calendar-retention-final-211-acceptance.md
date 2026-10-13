# M20 calendar retention final 211 acceptance

- Local timestamp / acting role / milestone: 2026-10-11T19:23:16.246948-04:00 / tester / M20.
- Requested scope: Per-channel RAG current-calendar-week retention, names/IDs and verified atomic replacement.
- Starting repository state:006 unapplied, original108836 archive intact, all calendar fixes implemented.
- Work performed / changed files: Final211/211 integration, APIbuild and diff pass. Focused calendarSQL17/17 names/IDs on normal/cache/superseded, new oldsource/monthprefix catch-up passed.
- Decisions: Local acceptance is distinct from actual model/hosted acceptance; no embeddings or automatic context.
- Checks and evidence: Largest6397-original published/pruned with83maps+3reducers/86fakecalls; planning9.46/11.09/9.67s, fingerprint429ms, finish665ms. Actual logs independently inspected. See evidence/m20-discord-summaries/calendar-retention-integrated-tests.log.
- Resulting state / acceptance: LocalPASS, reviewed006 permitted for already-authorized rollout.
- Remaining work and handoff: Apply accepted006 once, actualRPCtiming and stagepilotreview, compaction and Railwaysummarycron; journal each hosted pass.
