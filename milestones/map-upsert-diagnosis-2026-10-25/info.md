# Railway map upsert diagnosis — October 25

Goal: explain the latest rejected map upsert using production evidence and existing validation.
Scope: read-only Railway/audit/database inspection and offline replay. No application changes or deployment.
Completion criteria: identify the failed call, reproduce its cause, check any retry and saved result, and obtain independent review.
Status: complete; evaluator ACCEPT.

The chat request supplied both raw event timestamps and local event clock fields. The validator rejects that combination even when the times agree. The next request removed only the local fields and succeeded six seconds later. All four submitted participant attendance records are saved. Follow-up confirms the canonical Calendar original is cancelled: the next Calendar sync restored cancelled map status while preserving all attendees. Cancelled events and their avatars are filtered from the map. Calendar cancellation actor and exact cancellation time remain unverified.

Railway reports unknown for this specific failure because its fixed diagnostic dictionary lacks the map_time reason. Existing prompts already describe using one representation; no prompt or validator changes were made.

Private retained proposals and readback stay in ignored evidence/map-upsert-diagnosis-2026-10-25. Tracked receipts contain operational metadata and field names only.

[Integrated evidence](../history/2026-10-25_13-37-33-307603-orchestrator-map-upsert-railway-diagnosed.md) · [Independent review](../history/2026-10-25_13-37-33-307603-evaluator-map-upsert-diagnosis-accepted.md)

Follow-up source/timing verification uses the actual running worker configuration and frozen deployed Calendar client, retaining normal account/ACL checks. Exact Calendar updatedAt matches map reported_at, and the cancelled map write falls within the successful sync. Independent frozen-module cancellation/visibility checks pass. [Follow-up evidence](../history/2026-10-25_13-42-05-954878-orchestrator-missing-map-update-traced-to-calendar-cancellation.md) · [Independent acceptance](../history/2026-10-25_13-42-05-954878-evaluator-calendar-cancellation-diagnosis-accepted.md).
