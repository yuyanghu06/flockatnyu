# Current checkpoint failures reproduced before fixes

- Local timestamp / acting role / milestone: 2026-10-25_17-18-06-106697 America/New_York / tester-baseline / planner-throughput-fix-2026-10-25.
- Authorized scope: user requested saving/repeated-read fixes and a larger batch so planner keeps up.
- Work and evidence: Independent baseline257checks/247pass/10fail.9existingtaskread/finishREDcontracts and1missingignoredfixture documented separately. Actualcurrenttaskstore/pipeline/handler+PGlite reproduce257801compact/262898JSONB and270183compact/275307JSONB rejects. Prior200historyentries/originals and simulatedactionreceipt retained;newhistoryunsaved/queueackfalse. Zero network/modelcalls. Evidence tester-baseline* under ignoredplanner-throughput-fix folder.
- Result/handoff: preparation accepted; code/testing/review/release remain pending. No live changes in this pass.
