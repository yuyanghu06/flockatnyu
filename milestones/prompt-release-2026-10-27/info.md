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
