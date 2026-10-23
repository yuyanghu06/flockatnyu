# Followup conflict routing guidance fixed

- Local timestamp / role / milestone: 2026-10-23T18:26:54.940181-04:00 / coder / planner-followup-focus.
- Scope: current-cycle first, one/two tasks, compact reads, existing16/64/10budgets and actualconfiguredmodel tests.
- Work/checks/evidence/result: Narrow follow-up prompt corrections from realmodel evidence: mapCASconflict invalidates mapsnapshot,notunchangedtaskproof; keep slot,readfreshmap,merge/repatchsametask,do notdefer/reload absent actualintent/targetchange. Newparticipantfirstpatch suppliesbothendpoints, whole-eventinheritexample; independent neededsource/lookup/mapreads canbatchwithinselectedgroup. Early routing distinguishes ownoriginalsourceUUID forpersonlookup from Calendar-map sourceUUID. Onlyprompt/documentation changed; no backendworkflow/limit/schema changes.30targetedchecks then11routingchecks,APIbuild and whitespace pass; implementationfrozen.
- Parent regression evidence:206available focused/integration cases pass withzero failures after explicitfullmode adaptation. One older ignored private replay lacks case.json and is deliberately excluded by standard test-skip-pattern,notclaimedpassing. See /tmp/flock-followup-available-integration.tap.
- State/limitations: first26inferences are not26passingtests. Follow-up decisions realmodel; initialsetup and allbusinessservices simulated. No production mutation,deploymentorcredentialoutput. Unrelatedchatworkpreserved.
- Next: correctedfreshsnapshot/offlinepreflight,declared20dispatchfailed-casegate,independentsemanticevaluationandfix/retestbeforeacceptance.
