# Request-local map authorization optimization

- Local timestamp / acting role / milestone: 2026-10-19T11:51:48.183355-04:00 / coder (independent specialist) / production map refresh.
- Scope: optimize browser projection only, keeping general event write authorization uncached.
- Files: server/map/presence.js, server/map/source-access.js, tests/map-presence.test.mjs, tests/map-source-access.test.mjs. Parent refreshed map guide.
- Implementation: optional createReadScope binds one principal/signal/validated snapshot; exact declaration event/person/source checks run before sharing original provider authorization by sourceUUID+URL. One projection reuses its initial snapshot. Up to4event/building checks and4participant checks run concurrently; output assembly stays deterministic. No cross-request cache, stale fallback or wider grants.
- Verification: coder final93/93focused source/presence/attendance/orchestration/events checks pass in2.205seconds, whitespace clean. New regressions cover24people×9buildings×2events with one snapshot/provider read, next-request revocation, denied/foreign marker binding, max4concurrency and cancellation. Parent actual-data runtime default5second reads200at4424/1371ms,9buildings/5events/0activepeople. Frontend/API builds pass.
- Limitations: hosted old release still503until rollout; independent browser/evaluation pending.
- Handoff: independent acceptance then sanitized protected-web deployment; worker/source permissions unchanged.
