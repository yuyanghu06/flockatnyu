# M17 independent local verification

`local-tests.log` records the combined assistant and Discord fixture/SQL suites.
`api-build.log` records the actual backend syntax/dependency build check.
`tester-report.md` separates these local results from outstanding hosted work.
`signal-preload.mjs` is a no-network subprocess fixture for exercising the real
Discord CLI SIGTERM handler; it injects an abortable in-flight request and never
prints credentials. Deployment tests create and remove temporary build contexts.
No live Discord, Railway or Supabase call is made by this test pass.

`live-storage-report.md` records a separate independent hosted verification pass
using aggregate/catalogue SELECTs only, after the authorized single-channel
backfill. It includes exact queries, stored-original integrity and checkpoint
results, hosted RLS/grants and explicit live-coverage/deployment limitations.
No message text or raw payload body is exposed in this evidence.
