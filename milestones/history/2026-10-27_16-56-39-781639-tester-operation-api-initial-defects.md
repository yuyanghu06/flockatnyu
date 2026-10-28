# Independent tests reproduced transport regressions

- Local timestamp / acting role / milestone: 2026-10-27T16:56:39.781639-04:00 / tester / tool-operation-api-live-2026-10-27.
- Requested scope: resume runtime/live tests of the new tools → private API → services structure.
- Starting repository state: Independent baseline and transport testers used actual local modules without env files and blocked network.
- Work performed / changed files: Baseline found unsupported-operation status differences. Transport tester covered all 54 routes and reproduced circular/non-JSON response serialization throwing after a completed write. A Calendar test compared session-specific functions instead of stable catalogue metadata.
- Decisions: Preserve hidden-operation authorization as forbidden, unknown names as invalid_request, original stopping exception identity and unknown outcomes for unreadable completed writes.
- Checks and evidence: Initial request changes recorded. Source-free evidence is ignored under evidence/tool-operation-api-live-2026-10-27/{baseline,transport}. Root owns source correction.
- Resulting state / acceptance: This pass is recorded separately from any production deployment. See the rolling snapshot for current acceptance and unresolved findings.
- Remaining work and handoff: finish configured-model/live-provider review, standard static/build gates, documentation and independent final evaluation. Preserve unrelated local notes and prior journal additions.
