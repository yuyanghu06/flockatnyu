# Contacts total count

- Goal: Put the total saved-contact count at the right of the existing loaded-row count on the same line.
- Scope: Private server count, additive browser list metadata and compact inline presentation; normal web-only publication/deployment.
- Completion criteria: Exact all-contact total with no raw download; loaded count stays left; filters and load-more behave; desktop/mobile alignment; meaningful behavior/preservation checks, CI/browser, independent ACCEPT and healthy hosted flow.
- Boundaries: HEAD contacts count only; source tools, exact reads/writes, raw profiles, model/provider settings and other services unchanged. No migration required.
- Latest pass: evaluator — Evaluator ACCEPT local release ready.
- Verification: Full CI3083pass/0fail/2optional skips;19focused and6browser flows pass. No material findings; no schema/model/source-permission changes.
- Next action: Publish through PR and exact-main release workflow, deploy web only, verify hosted count/layout and unchanged configuration.
- Latest history: [pass](../history/2026-11-13_16-28-41-555213-evaluator-total-count-local-release-accepted.md).
- Evidence: Git-ignored evidence/contacts-total-count-2026-11-13/.
