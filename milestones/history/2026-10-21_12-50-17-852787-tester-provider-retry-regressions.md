# Independent provider retry regressions

- Local timestamp / role / milestone: 2026-10-21T12:50:17.852787-04:00 / tester / harness reliability.
- Scope: independent synthetic provider retry/audit/streaming acceptance.
- Starting state: provider implementation landed while tests were authored; no original full red baseline claimed.
- Work performed:43new regressions in tests/provider-retries.test.mjs. Reproduced3noncooperative error-body cleanup deadline failures; coder fixed implementation independently. Existing tests unchanged.
- Checks: node --test tests/provider-retries.test.mjs tests/model-audit-provider.test.mjs tests/backend-provider.test.mjs tests/provider-tool-compatibility.test.mjs —88passed,0failed,0skipped. Cleanup reproduction now returns approximately22ms versus300ms failure watchdog.
- Decisions/results: Independent tester added43behavioral cases and reproduced3deadline failures caused by a rejected response body whose cancellation never settled. Coder bounded cleanup by the original signal; independent rerun passes88/88 across new retries and existing model-audit/provider compatibility suites. Covered transient/permanent statuses and network codes, three attempts,1s/3s delays, Retry-After, deadlines/cancellation, per-attempt audit and no replay after malformed/partial output. Queue verification remains underway.
- Changed files: assigned new test; parent shared journal.
- Limits/handoff: synthetic only, no external calls. Await queue acceptance, final review and integrated regression/build.
