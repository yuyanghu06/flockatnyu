# Footer focus clearance fixed

- Timestamp / role / milestone: 2026-10-27T11:10:29.578523-04:00 / coder / contacts-footer-clipping.
- Scope / starting state: CSS-only upward button positioning, preserving normal scrolling/form behavior; initial keyboard finding required fix/retest.
- Work / evidence / decisions: Added192px focus-scroll padding to the existing detail scroller alongside sticky footer positioning/opaque surface. Reserves caret plus four-row Notes clearance without added rendered space/dialog height. Intermediate84px/scrollmargin failures retained. FinalCSS8bcfe0198cb14ddf48f2c9070ae89a0ede87ba686b11fd636370811e35db8cc2. Only src/contacts.css application change.
- Result / remaining work: Local acceptance complete; root performs web-only rollout/live checks. No business service writes/model/provider call/schema/service-setting/commit/push changes. Physical mobile keyboard untested.
