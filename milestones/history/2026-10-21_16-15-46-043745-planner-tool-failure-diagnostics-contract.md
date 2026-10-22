# Content-free failure diagnostics contract

- Role/scope: independent read-only planner for historical Railway/audit failure review and reason logging.
- Findings: durable tool status/duration/counts exist but reasons/stages are dropped. Chat predispatch skips and worker proposal validation can bypass tool lifecycle. Worker sourceStatus/deferral must stay distinguishable from normalized ready.
- Contract: shared fixed dictionaries encode reason/stage/outcome/validation fields and observedHTTP/retryability/dispatched/proposal sequence into existing numeric counts (max32), mirrored as safe structured Railway logs with run/round/tool correlation. No migration needed; existing service-only seven-day retention remains. Unknown property/tool/error text must never be logged; only reviewed schema field IDs. Preserve missing HTTP as unknown; do not infer status400from local invalid arguments.
- Connector scope: optional safe diagnostics metadata on Google errors/results at OAuth/account/ACL/request/parse stages. No body, URL, account, token, argument values or exception text.
- Checks: read-only inspections, no tests/network/writes by planner. Parent historical audit retrieves19755rows/8463toolfinishes with allpages fetched; reasons unavailable. Implementation and independent acceptance follow.
- Boundaries: no mutation replay or permission/schema expansion. Model errors and partial/pending/access outcomes are separate failure-rate buckets.
