# Bounded truncation recovery contract

- Local timestamp / acting role / milestone: 2026-10-11_23-06-26-665054; orchestrator; M20.
- Requested scope: unattended completion under the existing Luna budget.
- Starting state:010 claim-timeout repair accepted live; patched cloud worker resumed.
- Work performed / changed files: metadata showed232 published records/32932 represented/75904 raw,1769 protected week. Cloud stopped provider_incomplete after225 more requests/64 publications. Total781 dispatches/$1.45935760,0running/0reserved. The failed25-record job used6054 input/6400 output tokens, exactly the ceiling. No database timeout or source loss observed. Assigned one explicit recognized-token-truncation escalation to coder with independent tester/evaluator.
- Decisions: first request stays6400; only API status incomplete plus reason max_output_tokens and committed valid usage may retry once at12800. Total attempts remain at most existing3; all new request/input/schema/output headroom must be reserved before dispatch. Repeated truncation and other malformed/refusal/filter/unknown-usage cases stop. Model/v3/cache/canonical/SQL/byte and original financial caps remain unchanged. No cloud restart until acceptance.
- Checks and evidence: Railway sanitized terminal result; failed-job/request token metadata. No source or model-output bodies logged.
- Resulting state / acceptance: adaptive recovery implementation/testing active; bootstrap incomplete and cloud stopped.
- Remaining work and handoff: accept bounded provider change, prepare fresh image, explicitly start same operation, then finish terminal retention and collector checks.
