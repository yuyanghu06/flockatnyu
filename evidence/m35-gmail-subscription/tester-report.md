# Agent pass report

- Milestone / role / scope: M35 / independent tester / Gmail subscription module,
  service-only metadata store, authenticated Hono callback, CLI and actual runtime
  shared-cache integration. PASS for the assigned local behavior.
- Starting state and files inspected: current project instructions and M34/M35
  milestone/to-do, tester/report templates, Gmail subscription/config/store/app/CLI,
  Google auth/client helpers, M34 event updater and existing Google fixtures.
  Coder provided concrete contracts; actual implementation was read independently.
- Work performed and changed files: added tests/gmail-subscription.test.mjs,
  updated tests/info.md and this evidence folder. No implementation/SQL/shared
  journal files changed. Tests use explicit synthetic config, isolated in-memory
  CAS checkpoints and injected HTTP/auth responses. A runtime integration case
  mocks OAuth2Client methods with node:test and restores them automatically.
- Decisions and assumptions: verifyPushToken is injected to simulate successful
  signature verification or failure while independently exercising required
  issuer/audience/service-principal/verified-email/expiry claims. Test IDs exceed
  Number.MAX_SAFE_INTEGER to verify string/BigInt checkpoints. Callback tests use
  Hono app.request, not a listening socket. No global account credentials are read
  or used. The watch baseline intentionally starts at current history, not an
  invented historical full-mailbox backfill.
- Checks: executed (exit0):

  `node --test tests/gmail-subscription.test.mjs tests/google-connector.test.mjs tests/agent-automation.test.mjs tests/agent-automation-sql.test.mjs`

  Result71/71 passing,0 failed/skipped. See tester-tests.log. Twenty-three new Gmail
  tests independently cover:
  - Disabled/unconfigured and explicit allowed-source/configuration gates before
    any auth, store or Gmail call.
  - Signature-verifier rejection, malformed token and wrong issuer/audience,
    push principal, email_verified type/value and expiry; no source read on denial.
  - Bounded canonical base64 notification parsing, subscription/account mismatch,
    malformed histories and stable string IDs above JavaScript's safe integer range.
  - Full raw email delivery with exact source/event identity, no source bodies in
    metadata state, and advancing history only after successful enqueue.
  - Old/duplicate notification without Gmail access; no-change history success.
  - Initial watch metadata and renewal catching up before watch without replacing
    the old cursor with a newer watch baseline.
  - Overlapping deliveries allow one lease/processing path; CAS failure, lease
    expiry and cancellation preserve the old cursor.
  - Page-limit checkpoints resume with the same startHistoryId/pageToken; partial
    page enqueue failure keeps cursor and persists successful progress for a
    recreated subscription instance. Duplicate additions hydrate once. One valid
    history record containing101 additions drains100 then1 across two instances,
    advances the full cursor only afterward and clears progress metadata.
    Deterministically sorted page fingerprint/offset checkpoints resume work;
    changed page contents reset offset and replay through stable enqueue dedup
    without skipping newly inserted IDs. Ordering-only changes preserve progress,
    and old notifications still resume an unfinished page.
  - Failed/invalid/oversized full reads fail safely. Oversized full mail can use an
    explicit email_received_metadata raw-provider event; failed fallback retains
    the cursor. Actual createGmailSubscriptionRuntime's authorizer accepts this
    event type through the real shared updater and RPC store; failed enqueue keeps
    the prior cursor and pre-existing unrelated cache row.
  - Gmail history404 records resync_required; later watch cannot silently reset
    the baseline. Wrong OAuth account/scope or persisted source config denies reads.
  - Trusted service RPC origin/key/size bounds, safe error codes, Hono request-size
    and status mapping, and sanitized CLI outputs. Normal ingestion performs only
    Gmail GETs; watch/renew alone POST to /watch. No sends, mailbox edits or Drive
    writes are called.
- Findings / failures / unavailable checks: evaluator found a P2 liveness defect
  after initial68/68 acceptance: a single history record containing101 additions
  exceeded the100-message budget, so every run returned pending with zero progress.
  The prior budget test asserted pending but did not require eventual progress;
  that gap is corrected. Coder added metadata-only sorted page fingerprint/offset
  continuation and failure checkpointing. Three additional regressions cover101
  messages across fresh instances, changed fingerprint and ordering-only changes;
  the existing small-budget/failure tests now require progress/recovery. An interim
  run after the implementation fix had20/22 passing due to old replay/reset fixture
  expectations; those tests were updated to the new continuation semantics.
  Initial68/68 output is preserved in tester-tests-initial-68.log and the interim
  output in tester-page-progress-fixture-adjustment.log. Final71/71 supersedes both.
  No material defect remains in tested behavior. Parent implemented metadata fallback during this pass; independent
  tests cover both isolated and actual runtime paths. Preliminary fixture syntax
  was corrected before the earlier17/17 subset log; no implementation edits were
  made by tester. Real Google OIDC signature/JWKS rotation, IAM/PubSub provisioning,
  OAuth refresh, actual email delivery, hosted Supabase/PostgREST, multi-process
  contention, daily watch timers and Railway deployment were not exercised.
  Checkpoint concurrency tests use shared in-memory CAS;019's actual CAS behavior
  is separately executed by the M34 PGlite suite included in the final command.
- Acceptance verdict and remaining work: PASS locally; activation and live delivery
  remain parent-owned. Large emails provide explicitly partial metadata rather
  than a complete MIME body, and expired history explicitly requires resync.
- Folder-guide updates needed: tests/info.md and this evidence guide updated;
  orchestrator owns shared milestone/evidence indexes.
- Handoff and recommended next action: journal this pass, independently evaluate
  M35 and verify external prerequisites before claiming a live Gmail subscription.
