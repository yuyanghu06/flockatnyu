# Manual planner start

Goal: let a caller with the dedicated PLANNER_API_KEY force one standard queued-input planner cycle and optionally limit it to exact Discord channels. An explicit whitelist overrides policy channel/category exclusions only for that run; omitted/empty uses normal blacklist rules. No history import, synthetic trigger original or continuous worker in the web service.

Scope: API-key POST/status routes, durable service-only metadata requests, existing-worker dispatch, dedicated forced claim preserving global lease/retries, scoped Discord source facade and current access checks. Calendar, Member Plans, deterministic map projection and bounded follow-up remain unchanged.

Completion: meaningful HTTP/auth/CSRF, actual SQL lease/cooldown/request and real adapter source-scope tests; independent evaluation; hosted forward migrations and source-reviewed deployment verification. Status: implemented, independently accepted and deployed. Hosted route/auth/start/status and worker readiness are verified; harmless empty test waits behind an already-active cycle. Parent owns shared journal and integration; current receipts are in ../milestone.md.

API-key auth supersedes the earlier session/capability implementation. Local130checks and API build pass. API-key web release c83f2495 is deployed with manual-auth.js and the exact planner cookie-gate exception; missing/wrong-key denials and ordinary website protection are verified. The user will configure PLANNER_API_KEY on Railway web. No environment variable or worker was changed by this auth release; positive real-key dispatch remains unverified.
