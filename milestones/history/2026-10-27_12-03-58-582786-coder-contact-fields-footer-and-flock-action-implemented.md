# Contact fields footer and flock action implemented

- Timestamp / role / milestone: 2026-10-27T12:03:58.582786-04:00 / coder / contacts-flock-context.
- Scope and starting state: Fix field/footer overlap and implement the clarified Flock it! selected-contact prompt context. Existing dirty tree and other work preserved.
- Work, checks and decisions: Contacts coder changed only src/contacts.js and contacts.css. All fields/profile/notices now live in their own scroller; a normal sibling footer owns actions with explicit native form association. Sticky overlay and192px workaround removed. Focus adjusts only its scroll area when a field fits. Flock it! beside profile delete passes only saved UUID/first/last names after closing Contacts; dirty drafts survive. Own six-size resized Notes and form/error/keyboard checks pass.
- Evidence: Ignored evidence/contacts-footer-layout/; meaningful new tests/contact-chat-context.test.mjs. Sources frozen for model evidence. All checks are local/simulated except configured inference; no live business writes, deployment, commit or push in these passes.
- Acceptance and handoff: Independent final reviews and isolated website rollout/fresh-page checks remain. Actual user tab and unsaved drafts must remain intact.
