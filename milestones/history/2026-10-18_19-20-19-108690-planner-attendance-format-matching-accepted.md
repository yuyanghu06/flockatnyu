# Attendance title-format matching plan accepted

- Local timestamp / acting role / milestone: 2026-10-18T19:20:19.108690-04:00 / planner and orchestrator / attendance matching follow-up.
- Requested scope: screenshot shows AWS Hackday failing to resolve existing AWS Hack Day.
- Starting state: clean published24f67cf; previous live test used short AWS and did not cover compound spacing.
- Findings: literal title matching in find and set rejects the compound variation; current-message event-phrase binding also needs the same rule. Exact person and source gates remain valid.
- Accepted plan: NFKC lowercase Unicode letter/number tokens, compact query matched only across contiguous whole candidate tokens. Apply at all four event phrase checks; do not add fuzzy/synonym matching or choose among multiple candidates. Empty/prefix-only/invented query negatives, equivalent-title ambiguity, dates and write revalidation need regression coverage.
- Ownership: attendance coder owns service, focused tests and optional tool-description update; orchestrator owns guides/journal/deployment. No schema/frontend/worker changes requested.
- Checks: planner inspected current source/tests; no planner external calls or tests. Parent live bounded event metadata read confirms actual scheduled AWS Hack Day and literal mismatch.
- Result: implementation underway; independent tests/review and isolated web redeployment follow.
