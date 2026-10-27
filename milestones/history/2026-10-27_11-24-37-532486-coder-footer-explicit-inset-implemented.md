# Footer explicit inset implemented

- Timestamp / role / milestone: 2026-10-27T11:24:37.532486-04:00 / coder / contacts-footer-clipping.
- Scope: User requested the entire button container end above the base clipping boundary before scrolling. Actual user tab was found to have old CSS and an unsaved edit; it must remain intact.
- Work and evidence: Changed only sticky footer bottom from 0 to 16px; retained 192px focus clearance. Six DPR2 viewports include the actual user size 1512x688. Footer bottom612 versus panel cutoff652 gives 40px clearance. User tab and unsaved draft untouched.
- Acceptance and remaining work: Local checks accepted. Root owns frontend-only release and fresh-page verification. No schema, business data, provider/model call, other service, commit or push changes.
