# Signed Gmail push rejection isolated

- Local timestamp / acting role / milestone: 2026-10-17_14-28-45-149971 America/New_York / independent tester / M35.
- Scope: inspect diagnostic revision3ddf9e1f-eccd-4dcc-896e-2e052897f258, no external writes.
- Checks: exact revisionSUCCESS/stoppedfalse; runtime ready/queued0 at18:27:40UTC, then fixed reason notification_history_type at18:27:45UTC. Signed-token/envelope/encoding checks precede this reason, narrowing failure to decoded non-string notification historyId.400s continue. No raw payload/type values printed. Sanitized live evidence appended; original pass preserved in *-initial files.
- Decision: narrowly support positive safe-integer numeric wake-up IDs by exact string conversion; reject unsafe/fractional/nonpositive values. Provider-returned cursor strings and authoritative history sync remain unchanged. Add enum classification to diagnostics without values. Actual numeric form is a compatibility hypothesis until accepted live retry; the observed reason alone establishes non-string.
- Handoff: Gmail coder owns implementation, tester owns numeric/wakeup/cursor regressions, evaluator reads; root redeploys after acceptance. No sends/model calls/other-service changes.
