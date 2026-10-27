# Native contact projection and email upgrade

- Local timestamp / acting role / milestone: 2026-10-27T10:52:42.216890-04:00 / coder / treg-contact-diagnosis.
- Requested scope / starting state: Implement native projection and separate original lookup email storage, preserving existing dirty tree/native JSON/raw cache and concurrent daily provider work.
- Work performed / changed files: Added contact-fields.js, shared browser/model/import/tool projections, private exact snapshots for edits, lookup_email transport and fixed exact-email read RPC. New051 adds nullable column, private projection/match functions, search upgrade and completion insert. Existing050 completion body differs only for effective-email duplicate check and separate lookup_email insert. No old migration rewritten or existing row backfilled.
- Decisions: Known person wrapper permits absent/true found flag; explicit other flags suppress nested fields. Explicit top-level manual keys including blank/null suppress fallback. Unknown native data remains saved; no recursive guesses.
- Checks and evidence: Coder syntax/PGlite047–051/projection/search/email match and six-case wrapper matrix pass. Root API build passes and UI screenshot inspected. Initial older fixtures failed new RPC/private-output expectations; tester assigned contract updates. Concurrent daily SQL failures remain separated. Final helper and051 hashes communicated for independent review.
- Resulting state / acceptance: Implementation locally present, independent regression/review pending. No external writes, live repair or release yet.
- Remaining work and handoff: Tester owns adapter/SQL checks and fixture updates; evaluator reviews final evidence; root owns narrow schema/authorized two-email recovery and web isolation/release.
