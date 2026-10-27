# Company count integration fix complete

- Local timestamp / role: 2026-10-27_13-49-19-862046 / orchestrator.
- Requested scope: fix the two company-enrichment integration failures.
- Starting state: implemented fix with accepted independent tests; dormant routes remain inactive.

Integrated the user-requested numeric employee-count compatibility fix. Only server/treg-lookups.js changed in application code. Both original Google and Microsoft provider responses now pass the actual client and authenticated local HTTP handler, with counts exposed as decimal text and original numeric bodies retained unchanged in private logs. Strict invalid-value checks and the independent HTTP contract remain intact.

Independent tester and evaluator accepted the fix. All 44 affected regression groups pass, including nine focused route groups; root API build and whitespace checks pass. This is replay of the exact saved upstream responses using an offline transport, not a paid provider rerun. No new network/model/paid calls, business writes, schema/settings changes, endpoint activation, deployment, commit or push were performed for this fix.

Root generated and hashed a fresh 295-file website package: it is byte-identical to the currently deployed a60d7107 package and excludes the two dormant lookup modules. Deploying it would not carry this fix into any active runtime, so no empty deployment was performed. The inactive handlers are corrected for their next explicitly requested integration. Provider-data accuracy remains outside this compatibility repair. No required work remains; preserve unrelated working-tree edits.

Private verification evidence is ignored under `evidence/treg-company-count-fix/`. Credentials and native provider content are excluded from this journal.
