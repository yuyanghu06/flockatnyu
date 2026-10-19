# Custom-domain HTTPS verified

- Local timestamp / acting role / milestone: 2026-10-19T12:09:32.031241-04:00 / orchestrator / domain security follow-up.
- Requested scope: investigate user's unsecured-domain indicator.
- Starting state: custom-domain login repaired; concurrent private model audit untouched.
- Work performed / changed files: read-only live TLS, DNS, Railway status and fresh Chrome login/app security inspection. Only journal/evidence updated; no hosting or application changes.
- Decisions: no certificate reset or security weakening; user-visible warning not reproduced.
- Checks and evidence: verified TLS1.3 certificate issued by Let's Encrypt YE1 for flock.techatnyu.org, valid2026-10-19 14:55:02UTC through2027-01-17 14:55:01UTC. Railway domain ACTIVE, verified, certificate VALID/COMPLETE, CNAME propagated. HTTP301toHTTPS; HTTPS HSTS max-age31536000. Fresh Chrome CDP reports secure with no issues on login and authenticated app, isSecureContext=true, zero HTTP/ws requests and zero mixed-content warnings.
- Resulting state / acceptance: current HTTPS setup verified healthy. Exact cause of user's browser indicator remains unconfirmed; reopening exact HTTPS URL distinguishes stale tab/address state.
- Remaining work and handoff: if indicator persists, obtain exact browser warning; no source/model writes or calls performed.
