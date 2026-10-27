# Markdown prompts and fixes: deployed

Goal: publish and deploy the structured Markdown prompt migration and both selected Contacts/Calendar wording fixes.

Status: complete. PR #1 merged the prompt release; PR #2 merged the required worker image correction after normal CI/browser checks. The separately authorized full-tree Railway rollout deployed the exact same 87 assets/353 prompt payloads, so this chat verified that rollout instead of uploading over it. See [verification](verification.md) and [safe deployment receipts](receipts.json).

Boundaries: Contacts target clarification and complete-empty Calendar stopping behavior retain their accepted configured-model evidence. The original separate Calendar location repair was not silently added to this chat's release; it was deployed under the other chat's full-tree authorization. No rejected worker artifact was uploaded. No new model/business calls, SQL, credentials, source grants, volumes or manual production cycle were introduced here. Worker remains disabled.

Completion criteria met: normal local CI, five browser flows, independent source/image/evidence acceptance, pushed and merged PRs, successful release packaging, actual Railway deployment IDs and independent normal-login/health/exact-asset verification. Active worker execution remains outside this deployment verification.

Pre-release rollback targets remain recorded in immutable release history. Source rollback does not reverse data/schema changes; this prompt release applied none.
