# Agent pass report

Latest verdict: PASS for deployed collector health, active watch, authenticated
notification acceptance and rejection of unsigned/forged requests. Final deployed
revision is79247d6f-c10f-4642-9371-540a3cee14d9. Actual newly received email enqueue
remains unobserved (cache0). Earlier failures below are preserved pass history;
the final retest section supersedes their live-delivery verdict.

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

## Diagnostic deployment retest —2026-10-17 18:28UTC

- Preserved original pass as live-tester-report-initial.md and
  live-tester-checks-initial.json; subsequent observations append to the main JSON.
- Added four independent local encoding/diagnostic tests. Executed
  `node --test tests/gmail-subscription.test.mjs tests/google-connector.test.mjs`:
  39/39 PASS, exit0; diagnostic-tests.log. Canonical standard/base64url alphabets,
  optional valid padding and zero/one/two padding characters succeed. Mixed
  alphabets, invalid padding and noncanonical bits fail. Diagnostic output contains
  fixed reason/type labels only, callback exceptions/rejections cannot change
  rejection behavior, and JSON charset headers preserve the HTTP401 auth gate.
- Exact diagnostic deployment3ddf9e1f-eccd-4dcc-896e-2e052897f258 is SUCCESS and
  stopped=false. Runtime reports ready/queued0 at18:27:40.557UTC.
- Live diagnostic at18:27:45.661UTC is
  `status: push_rejected, reason: notification_history_type`. Its position in the
  actual handler establishes signature/claim verification passed before rejection;
  decoded historyId is not a string. Its type/value was not logged or inspected.
  Repeated POST400 remains observed; no accepted POST200 yet.
- Verdict remains PARTIAL / delivery failure unresolved. Parent and coder were
  notified immediately. The exact rejection boundary is now known without source
  bodies, authorization headers, account names or token claims in evidence.

## Numeric notification compatibility — local acceptance

- Parent authorized the narrow compatibility fix after the diagnostic identified
  notification_history_type. Added two independent tests for safe numeric history
  wake-ups and unsafe rejection. Reexecuted the same Gmail/Google command:
  41/41 PASS, exit0, updated diagnostic-tests.log.
- Safe positive integers, including Number.MAX_SAFE_INTEGER, normalize without
  precision loss. Tests require a history API read from the stored cursor and
  advancing only to the trusted API response cursor. Numeric1 can acknowledge an
  already-seen notification without a read. Unsafe/fractional/zero/negative and
  nonfinite inputs reject before state/Gmail access. Provider API histories remain
  strict strings, preserving existing BigInt cursor semantics.
- No cloud writes or payload inspection occurred in this tester pass; live
  acceptance still requires retesting the parent's next exact deployment.

## Final numeric-compatible deployment —2026-10-17 18:30UTC

- Exact Railway deployment79247d6f-c10f-4642-9371-540a3cee14d9 independently
  reports SUCCESS and stopped=false. Runtime listening18:30:16.955UTC and ready
  with queued0/messages0 at18:30:18.568UTC. Read-only CLI commands exit0.
- Final deployment HTTP logs contain POST /webhooks/gmail HTTP200 at
  18:30:24.902UTC. This handler returns200 only after OIDC verification and complete
  notification validation succeed; thus the authenticated callback path now works.
  No HTTP400 is observed in the final deployment sample. No request payload,
  identity token or sender account was inspected to reach that conclusion.
- Independent harmless probes against the running public service: GET /healthz
  HTTP200 ready; unsigned POST{} with JSON charset header HTTP401 unauthorized;
  forged-token POST{} HTTP401 unauthorized. Local diagnostics/compatibility suite
  remains41/41 PASS as recorded above. Full root tests are separate evidence.
- Read-only hosted checkpoint: status ready, cursor4242861, lastSyncAt
  1792261817590, expiration1792866230852, lastWatchAt1792261430914, no lease.
  lastSyncAt is18:30:17.590UTC, before the accepted18:30:24.902 callback; it
  evidences startup reconciliation, not processing caused by that notification.
  Source/event-type aggregate cache count remains0; no actual new-email enqueue
  is claimed. Parent is requesting a user-sent test email separately.
- Acceptance verdict: PASS for live subscription/watch/notification transport and
  fail-closed auth, resolving earlier400 callback failure. Real new-mail-to-cache
  acceptance remains pending new mail; healthy/signed notification alone does not
  prove raw-message ingestion. No email send, watch change, cloud mutation, model
  call or application edit was performed by tester.
- Handoff: parent may journal accepted transport, retain original failure evidence
  and independently verify a new Gmail cache row after user mail arrives. Current
  map/Calendar write tools and LLM activation remain outside this live test.
