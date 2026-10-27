# User tab old CSS and footer inset scoped

- Timestamp / role / milestone: 2026-10-27T11:22:27.661092-04:00 / orchestrator acting planner / contacts-footer-clipping.
- User correction: Buttons stillclipbeforefirstscroll; buttoncontainer mustendbeforebaseclippingboundary.
- Evidence: Actual user Chrome tab read throughCUA,1512x688DPR2, loadedold main-59a_SPH0.css. Computedfooterstatic/bottomauto, footerbottom695.5 vs panelbottom652 atscroll0. Thus previouslypublishedstickyCSS notloadedinthisopenpage. Actual tab has an unsavedcontactedit; no reload/navigation/formeditperformed. No personalfieldvalues retainedhere.
- Plan: Add explicit16pxstickybottominset tocurrentfix, retaining192pxfocusclearance; coderCSSonly, independenttesterrequireswholefooter/buttons>=16pxbeforeclippingancestorbottom atscroll0 pluscurrentkeyboard/Notesbehavior. Rootownswebonlyrelease/journal. Userwillneedsave/cancelcurrentdraftbefore refreshing.
- Result: Diagnosiscommunicated; implementation/checks/releasepending. No businesswrites/model/providercalls/schemachanges.
