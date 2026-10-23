# Attendance corrected; ambiguous target still fails model check

- Role / milestone: independent tester / chat-time-spotlight-queue.
- Scope: rerun only2prior genuinefailures after null-projection and general ambiguity instruction fixes. Production runner/adapters, configured gpt-6-luna, simulated stores, exact inference-only network guard. Hard12dispatch cap includingretries.
- Command: node --env-file-if-exists=.env tests/chat-map-time-model.mjs --live-model --case=attendance-preserves-instants --case=ambiguous-stern-clarifies --max-requests=12.
- Actual result:11dispatches;19sourcepinsstable; exit1. AttendancePASS with1appliedupdate preserving parent/oldparticipants/microseconds/building. AmbiguityFAIL: model read2records, separately rereadboth, updatedfirstrecord and onlyafterwardaskedwhethersecondwasintended.1simulatedattempt/1appliedwrite. No live businesswrite.
- Evidence: /tmp/flock-chat-map-time-retry12-Fstw9N/ contains immutable ledger andmatching source snapshots. Original24gateunchanged. Strong ambiguity assertion rejects any proposedmutation, evenbeforeDB.
- Acceptance: REQUESTFIXES, no deployment. Timeconversion, queue and nullinheritance accepted componentresults do not excuse unsafe ambiguousselection. Bounded nextstep puts explicit same-request ambiguity instruction nearplanningdecision/tooldefinitions and resolves conflictwith independent-work guidance; no natural-languageparser or backendbusinessworkflow gate. Freshmodelgate requires separatehardcap and retainedfailures.
