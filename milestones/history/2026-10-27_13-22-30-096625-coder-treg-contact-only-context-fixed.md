# Contacts-only context compatibility fixed

- Timestamp / role / milestone: 2026-10-27T13:22:30.096625-04:00 / coder / treg-default-save.
- Starting state: Registry injection prevented an existing Contacts-only wrapper from cloning request context.
- Work: Create and inject the native-result bridge only when a Treg request adapter exists. Contacts-only context retains its previous structure. No other frozen application file changed.
- Checks: Exact selected-Contact and Gmail-send suite now passes8of8, whitespace clean. Assistant-context frozen SHA533882936788739d2bfc4ddda098785e9bc42e209ba349b64a9a9fe735657711. Independent evaluator reviewed sole diff as equivalent for Treg-enabled model cases.
- Evidence and limitations: First model report spent18requests; four scenarios passed before sourcepin guard stopped the in-flight Contacts-edit scenario. That interrupted report remains pinsStable=false and is not represented as a full passing run. Tester resumed three targeted cases on finalfreeze under the same cumulative32HTTP limit. Independent new deterministic8groups pass including final-log-failure and registry bounds.
- Result / handoff: Focused regression resolved; finish final actual-model cases and independent release acceptance. No paid Treg, production Contacts, daily service or schema changes.
