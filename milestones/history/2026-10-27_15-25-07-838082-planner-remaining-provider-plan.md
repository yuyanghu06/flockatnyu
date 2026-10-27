# Remaining provider changes planned for the new style

- Local timestamp / acting role: 2026-10-27_15-25-07-838082 / planner.
- Scope: integrate all previously separate Brand.dev/company-comparison work and leave a clean working tree. Keep provider logic in server services and preserve dormant route exposure.
- Plan: retain validated Brand.dev request/projection behavior, accurately document selector precedence and dormant HTTP access, format source, and split the large dormant test suite into a shared fixture and focused client/HTTP suites under the existing line limits.
- Acceptance: native records/private logs, one selected provider request, budgets, idempotency, safe errors and all four dormant 404s remain unchanged. No paid calls, deployment, cache writes or schema changes.
