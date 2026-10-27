# Assistant contact chip and transport implemented

- Timestamp / role / milestone: 2026-10-27T12:03:58.584990-04:00 / coder / contacts-flock-context.
- Scope and starting state: Fix field/footer overlap and implement the clarified Flock it! selected-contact prompt context. Existing dirty tree and other work preserved.
- Work, checks and decisions: Assistant coder changed only assistant.js/css and chat-client.js. attachContact validates and clones a saved selector, opens Flock, preserves typed text/files and never sends automatically. Removable/replaced first/last-name chip sits in the prompt column. Draft selection persists until removed, each queue/history/retry/steer entry keeps its own selector, and different selections queue as separate replies. Structured context counts toward byte limits and never appears as raw profile or UUID in visible text. Own transport, compiled Chrome smoke and existing queue-browser regression pass.
- Evidence: Ignored evidence/contacts-footer-layout/; meaningful new tests/contact-chat-context.test.mjs. Sources frozen for model evidence. All checks are local/simulated except configured inference; no live business writes, deployment, commit or push in these passes.
- Acceptance and handoff: Independent final reviews and isolated website rollout/fresh-page checks remain. Actual user tab and unsaved drafts must remain intact.
