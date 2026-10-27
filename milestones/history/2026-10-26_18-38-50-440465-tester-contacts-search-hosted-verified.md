# Hosted Contacts filters, focus and motion verified

- Local timestamp / acting role / milestone: 2026-10-26T18:38:50.440465-04:00 / tester / contacts-search-filters.
- Requested scope: Actual deployed funnel/filter/neutral focus and Spotlight motion, preserving Contacts/Gmail boundaries.
- Starting repository state: Reviewed website cbfbf5caSUCCESS and048actual private RPC readback passed.
- Work performed / changed files: Independent authenticated fresh headless Chrome over actual production website and read-onlyAPI; ignored hosted-browser evidence only. No credentials/cookies/source values persisted.
- Decisions: No simulated live contacts, Contact writes or hosted model calls. Empty CRM is honest; existing-record CRUD/ranking remain separately verified by actual local SQL/store/model fixtures.
- Checks and evidence: Four actual Contacts GET200ready/count0, all filter arguments reach API, Apply/Reset preserve globalquery, all4outline/filledstates pass. Native keyboardTab/ShiftTab establishesfocus-visible on Search/Workplace: neutralgray/inset, no purple outline. Emptygap12px, six blank Add/Cancel without writes,320viewportfit and380/180CSSmotion/focusreturn pass. No blocked requests/pageerrors/modelcalls. RootHTTPindex/eightbundlehash+combinedfilter+invalid/duplicate400checks pass.
- Resulting state / acceptance: Hosted browser PASS.
- Remaining work and handoff: Final release audit/current records. Physical mobile hardware and live saved-contact mutations remain unclaimed.
