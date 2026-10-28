# Markdown prompts and corrections release

Goal: publish and deploy the Markdown prompt migration and the selected Contacts/Calendar wording fixes.

Scope: existing operation-API commit02427 plus its tested result/cache corrections, structuredMarkdown loader/assets and safe browser split, packaging/tests, and two promptfixes. Exclude the separate later Calendar location/projection repair, credentials, raw private evidence and environment values. Original checkout remains preserved.

Affected production services: web, update-agent and Discord collector. Gmail collector/enrichment remain unchanged. Preserve existing variables, source grants, schedules, volumes and enabled state; no SQL migration or manually forced worker/test cycle.

Completion criteria: complete npmCI and browser checks, independent scope/evidence review, pushed PR merged after requiredchecks, successful main-only releaseartifact, exact artifact uploads, successful Railway rollout and safe authenticated/anonymous/file-hash readiness verification.

Known-good rollback deployments before release:

- web: a60d7107-c2de-4d31-97ca-bc243e4a8dbc
- update-agent: 2bcc7d90-0060-4107-b2b9-537d8f45ff58
- discord-events: 974cb14c-60ef-43bc-a2fe-9d2e06ee092f
- unchanged gmail-events: 239293ad-2c9b-4545-8199-5d4df85aeee0
- unchanged gmail-enrichment: d780e172-3aa8-41d6-a10b-b1cd24722aec

Status: isolated source committed through ce69ef2, full CI/browser and independent final review pending. No push or deployment yet.

Update: cleanrelease ebe0194 is published in PR1, with3040passingtests/2optional skips and5browserflows. Independent source/scope ACCEPT. Remotechecks andproductiondeployment pending. The updateworker is currently disabled and that state ispreserved.

# Markdown prompts and fixes: deployed

Goal: publish and deploy the structured Markdown prompt migration and both selected Contacts/Calendar wording fixes.

Status: complete. PR #1 merged the prompt release; PR #2 merged the required worker image correction after normal CI/browser checks. The separately authorized full-tree Railway rollout deployed the exact same 87 assets/353 prompt payloads, so this chat verified that rollout instead of uploading over it. See [verification](verification.md) and [safe deployment receipts](receipts.json).

Boundaries: Contacts target clarification and complete-empty Calendar stopping behavior retain their accepted configured-model evidence. The original separate Calendar location repair was not silently added to this chat's release; it was deployed under the other chat's full-tree authorization. No rejected worker artifact was uploaded. No new model/business calls, SQL, credentials, source grants, volumes or manual production cycle were introduced here. Worker remains disabled.

Completion criteria met: normal local CI, five browser flows, independent source/image/evidence acceptance, pushed and merged PRs, successful release packaging, actual Railway deployment IDs and independent normal-login/health/exact-asset verification. Active worker execution remains outside this deployment verification.

Pre-release rollback targets remain recorded in immutable release history. Source rollback does not reverse data/schema changes; this prompt release applied none.
