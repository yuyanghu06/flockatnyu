# Contacts footer clipping

Move Cancel/Save upward within the existing contact panel, preserving panel size and normal form/scroll behavior. Scope is CSS plus browser verification and a web-only release. Completion requires fully visible/hit-testable actions on desktop, short and mobile layouts and live verification. Current status is in ../milestone.md.

Live web7e3ae403: buttons and keyboard focus verified in authenticated Chrome desktop/short/mobile. Independent local5viewport form/action checks pass; no saved contact changes. Final independent read-only evidence review accepted; complete.

Explicit inset follow-up complete: web57187bd1 shows40px desktop/42px mobile whole-footer clearance before scrolling. Actual old user tab was preserved with its draft; save/cancel then refresh is needed there. Fresh authenticated assets/layout checks pass.
