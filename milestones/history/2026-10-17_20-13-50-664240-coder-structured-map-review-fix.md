# Structured map review fix

- Local timestamp / acting role / milestone: 2026-10-17T20:13:50.664240-04:00 / coder / structured-map-prompt. Recorded together during final integration; stage evidence is distinguished below.
- Requested scope: Resolve evaluator identity/capability wording findings.
- Starting repository state: Combined tests passed but instruction could be read as requiring a person lookup for event-only work.
- Work performed / changed files: Scoped person lookup to people_here only; event records require stable event/source identity and known building. Clarified trusted actual/custom tool callability; used generic activity example and plain-text angle-bracket handling. Owned source/guides only.
- Decisions: Events do not require attendees; supplied trusted tool definitions determine callability without extending runtime ACL.
- Checks and evidence: Syntax/scoped whitespace checks passed; prompt23897UTF8bytes below24KiB. Evaluator initially31/31; tester final32/32 includes new scope regression.
- Resulting state / acceptance: Material wording findings fixed; no source/SQL/cloud/tool registration changes.
- Remaining work and handoff: Tester and evaluator finalize evidence; root integrates documentation.
