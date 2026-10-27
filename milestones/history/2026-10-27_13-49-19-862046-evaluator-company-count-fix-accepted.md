# Company count fix accepted

- Local timestamp / role: 2026-10-27_13-49-19-862046 / evaluator.
- Requested scope: fix the two company-enrichment integration failures.
- Starting state: implemented fix with accepted independent tests; dormant routes remain inactive.

Independent read-only evaluation accepted frozen client SHA 3aca71492d24bc47e15477fd117204148e081b8bab94612f1416b79708defba1 with no required fixes. The change converts only nonnegative safe integer company employee counts to text. Other fields, invalid counts, native bodies and private logs retain their prior behavior. The HTTP boundary still rejects numeric values from injected clients.

The evaluator independently reran nine dormant-route groups, all passing, and reviewed the tester's 44 passing regressions and both original-response HTTP 200 replays. Authentication, logging, cost limits, idempotency and disabled fallback remain intact. Package manifests show the same 295 deployed files and exclude both dormant modules; root had already cleaned the temporary package, so the evaluator reviewed the manifest rather than repeating the byte inspection. Actual-app checks confirm the routes remain unmounted. No paid calls, production writes, deployment or route activation are needed.

Private verification evidence is ignored under `evidence/treg-company-count-fix/`. Credentials and native provider content are excluded from this journal.
