# Discord concurrency increase

Goal complete: production web and discord-events use ten active Discord requests per process and five per guild/member. The parser allows member1–5 and total1–10; fallback defaults remain3/1, hourly budget20 and all source/auth/pacing gates remain.

Implementation changed only the member parser cap. Expanded synthetic tests verify actual overlap, admission/reply isolation and slot recovery. Independent862regression tests, API build and evaluator acceptance pass. Both sanitized source deployments are SUCCESS; selected deployed variables and exact uploaded parser verify10/5, web health/protection pass and collector chat/Gateway resumed. See the rolling snapshot and latest release history/evidence for IDs.

Production load latency and direct remote module execution were not tested. Same-member/destination overlaps keep independent history snapshots; last successful completion replaces RAM history. No model calls/messages/schema changes or unrelated service deployments were made for verification. Status: complete.
