# Agent pass report

- Milestone / role / scope: M35 / independent live tester / read-only acceptance
  of Railway Gmail collector deployment94e195f7-cf24-4b46-aefc-238d035012cb.
- Starting state and files inspected: current milestone, docs/agent-automation.md,
  Gmail subscription/app/store/CLI, local test evidence and report template.
  Parent authorized only explicit service/environment/project reads, harmless
  health/auth-denial probes and metadata-only hosted SQL. Existing edits preserved.
- Work performed and changed files: this report and live-tester-checks.json only.
  Railway commands capture raw output privately, then retain sanitized status
  records. HTTP logs retain only method/path/status/timestamp; no addresses,
  headers, identity tokens, source account or email bodies were printed or saved.
- Decisions and assumptions: deployed success/health is checked separately from
  persisted Gmail watch state. HTTP400 alone does not prove a signed Google request;
  request headers/payloads were deliberately not inspected. The repeated400 pattern
  is an actionable observation, not a fabricated explanation.
- Checks: executed2026-10-17 around18:24–18:26UTC; exact commands and sanitized
  results are in live-tester-checks.json. All CLI/query wrapper commands exit0.
  - Explicit Railway service status: SUCCESS, stopped=false, exact deployment ID.
  - GET https://gmail-events-production.up.railway.app/healthz: HTTP200 with
    status ready/service gmail-subscription.
  - POST{} with application/json and no authorization: HTTP401 unauthorized.
  - POST{} with syntactically shaped forged Bearer a.b.c: HTTP401 unauthorized.
  - Explicit deployment runtime logs: listening at18:23:47.958UTC and watching
    at18:23:51.721UTC, watch expiration1792866230852.
  - Read-only hosted checkpoint: status ready, cursor4242834, lastWatchAt
    1792261430914, expiration1792866230852 (2026-10-24T18:23:50.852UTC), no lease.
    lastSyncAt is null. No account/body fields selected.
  - Read-only shared-cache source/event-type aggregate: zero rows.
  - Railway HTTP log sample100: repeated POST /webhooks/gmail HTTP400 from
    18:23:50 through18:24:41UTC; no accepted POST200 in that observation window.
- Findings / failures / unavailable checks: service health, initial Gmail watch and
  denial of unsigned/forged input PASS. Natural notification acceptance is not
  established, and repeated400 callbacks need investigation before claiming delivery.
  No actual email enqueue is observed. No test email, model call, watch renewal,
  cloud mutation or source edit was performed. Parent was notified immediately
  about the400 pattern and separately given confirmed watch evidence.
- Acceptance verdict and remaining work: PARTIAL. Healthy deployed collector and
  active watch independently verified; accepted authenticated Pub/Sub delivery and
  actual email-to-cache flow remain unverified. Resolve callback400 behavior, then
  recheck accepted notification logs and metadata-only source/event cache counts.
- Folder-guide updates needed: none within this assignment; orchestrator owns the
  evidence guide/index and milestone journal.
- Handoff and recommended next action: parent should investigate callback
  envelope/configuration/content-type validation while preserving fail-closed auth;
  retest the exact deployed fix before marking live delivery accepted.
