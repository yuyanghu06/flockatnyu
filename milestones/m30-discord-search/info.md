# M30: valid thread search results — complete

Diagnosed and fixed an application scope guard rejecting allowed thread hits
returned by successful parent-channel searches. Fresh source, permission, ancestry
and final-catalogue checks remain; additional thread checks are bounded.
Independent13-case regression coverage and90combinedtests pass. Real running API
search returns scoped originals. No role/allowlist/schema changes or model calls.
See ../milestone.md and evidence/m30-discord-search/ for actual evidence.
