# Drive cursor regressions

- Local timestamp / acting role / milestone: 2026-10-19_18-15-56-336557 / tester / Drive search repair.
- Requested scope: repair Drive searches while preserving runtime boundaries.
- Starting state: shared cursor implementation and tests awaiting integration.
- Work performed / checks / decisions: Independent tester reproduced the original five-file/528-character tilde-exclamation cursor failure before the fix. After the fix, 43 focused Google/Drive-skill/native-chat tests pass. Tests cover every printable ASCII character, maximum length, exact URL continuation, malformed/provider rejection, schema agreement and native top-level/nested cursor projection. Only assigned tests and their guide changed; all fixtures synthetic.
- Resulting state: correction and final acceptance pending.
- Remaining work: corrected integration tests, final review, guarded web/update-agent release and hosted verification.
