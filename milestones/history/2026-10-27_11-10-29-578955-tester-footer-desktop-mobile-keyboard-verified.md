# Footer desktop mobile keyboard verified

- Timestamp / role / milestone: 2026-10-27T11:10:29.578955-04:00 / tester / contacts-footer-clipping.
- Scope / starting state: CSS-only upward button positioning, preserving normal scrolling/form behavior; initial keyboard finding required fix/retest.
- Work / evidence / decisions: Independent actualChrome5viewports1440x1000/1200x700/900x500/390x600/320x568: existingdirty and blank/dirtycreate buttons fully contained+5hitpoints atscroll0; all60Tabfocusedfieldrects abovebar+hit; Notesfullyreachablebywheel; actualcoordinateCancel/Save preserve intended synthetic update/create counts and values; unchanged dialogheight;0externalrequests/errors. ReportPASS and commandexit0 in ignored tester evidence.
- Result / remaining work: Local acceptance complete; root performs web-only rollout/live checks. No business service writes/model/provider call/schema/service-setting/commit/push changes. Physical mobile keyboard untested.
