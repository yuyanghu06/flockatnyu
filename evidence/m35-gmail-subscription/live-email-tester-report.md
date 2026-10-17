# Agent pass report

- Milestone / role / scope: M35 / independent live tester / user-sent test email
  ingestion through the deployed Gmail collector. Verdict: PASS.
- Starting state and files inspected: current milestone/to-do, Gmail integration
  source and prior independent live evidence. User supplied subject test. Parent's
  safe aggregate indicated one matching entry; tester independently queried the
  hosted database rather than accepting that claim alone.
- Work performed and changed files: only live-email-test.json and this report.
  Read-only SQL runs through /tmp/tech-nyu-supabase-api.py api.query; request
  read_only=true is enforced by that helper. Explicit Railway deployment/service/
  environment/project HTTP logs are captured privately and reduced to timestamp,
  method, path and status. No raw body, address, header value, provider message ID,
  token or credential was printed or saved.
- Decisions and assumptions: SQL filters Subject case-insensitively to exact test,
  then emits aggregate counts, scoped event types, receipt times and structural
  booleans. Event identity/UUID checks are computed inside SQL, exposing only
  booleans. The identity check independently reproduces eventUuid's SHA256-derived
  UUID algorithm from source/event/revision fields; no provider IDs leave SQL.
- Checks: executed2026-10-17 18:35:06UTC; wrapper exit0. Exact read-only SQL and
  Railway CLI arguments/results are in live-email-test.json.
  - Exactly1 matching message,1 full email_received event, correct configured
    Gmail source2fa17434-212d-408d-ab20-448f8c2c5907.
  - Receipt time2026-10-17 18:34:20.688488UTC.
  - Full provider payload/MIME object/header-array structure: true.
  - Provider message identity matches envelope event identity: true.
  - Deterministic UUID matches source/event/revision hash: true.
  - Corresponding queue metadata is pending and matches source/event/revision:
    true; source payload is absent from metadata.
  - Mailbox checkpoint ready, lastSyncAt1792262060775, no active lease.
  - Exact running deployment79247d6f-c10f-4642-9371-540a3cee14d9 HTTP logs show
    POST /webhooks/gmail HTTP200 at18:34:21.346384466UTC, corroborating this
    ingestion window. No additional write or send was triggered by tester.
- Findings / failures / unavailable checks: none for assigned acceptance. Email
  text was not inspected or interpreted. This test proves actual raw-provider
  hydration/cache delivery and pending identity state; no LLM, map update,
  Calendar update, automatic semantic extraction or cleanup is claimed.
- Acceptance verdict and remaining work: PASS. Actual user-sent new-email
  ingestion is independently verified, closing the previous cache-empty limit.
  Prompt/context and concrete map/Calendar tools remain separate authorized work.
- Folder-guide updates needed: orchestrator owns evidence indexes and journal.
- Handoff and recommended next action: journal this pass and notify user that
  their test email reached the shared cache. No further live email is needed for
  this bounded ingestion acceptance.
