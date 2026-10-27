# Full-tree release verification

## Checked source and scope

The user explicitly requested committing/pushing and deploying the entire tree
on dev/tool-api-services to all five Railway services, without another production
cycle. Main is not merged or force-pushed. Source-only service packages exclude
private environment/OAuth files, logs, evidence, Git data and dependencies.

The isolated snapshot began with 4,239 source files. Current runtime/prompt/build
source matches the final CI snapshot. Six reviewed overrides cover three stale
API test fixtures, the worker Dockerfile, its image-content regression and a
literal-prompt whitespace attribute. Documentation/journal additions are separate
from runtime inputs. Private values remain in process memory.

## Checks and repairs

Exact npm run ci passes formatting, ESLint, physical file limits, API syntax/
runtime dependencies, frontend build and 3,050 tests with zero failures and two
optional skips. Standard browser checks pass all five flows with simulated
services and zero page errors. All 182 frontend build artifacts are hashed.

The first CI run retained five old fixture failures. Three test-file repairs
preserve dynamic source grants, reject forged controls before dispatch, require
zero work for pre-aborted requests and keep private map receipts below JSON.
Focused independent checks pass 23 cases. No runtime permission was loosened.

Independent container review then caught a real release blocker: worker Docker
omitted src/api and copied a nonexistent tools directory. The fix uses actual
worker roots server/prompts/src/api. New regression projects the COPY filesystem,
checks reachable files and imports real web/worker modules with networking
blocked and empty environments. Both omission controls fail; corrected cases
pass 3/3. The full CI result above is after this correction.

Source and corrected-container review ACCEPT. Prompt hashes stay unchanged;
Git attributes allow intentional literal trailing/final blank lines only under
prompts/. Existing lock audit advisories are retained: the SDK's Express server
middleware is not mounted, while fast-uri is used by upstream schema validation.
No locks were changed and no exploit test was performed.

## No-cycle boundary and corrected rollout incident

The old worker was idle before pause. AGENT_AUTOMATION_ENABLED is set false and
the existing process was stopped through explicit service-scoped railway down.
Collectors keep ordinary ingestion; no planner start/forced cycle is invoked.
Scheduled enrichment starts outside the entire 09:00–09:59 New York hour, keeping
its existing cron/NEVER/scheduled settings.

A later CLI zero-replica attempt unexpectedly reset the region and started an
old-artifact rebuild. Processing was already false. The original European region
was restored and that disabled deployment was stopped after build completion.
This incident was acknowledged to the user. Readbacks confirm enabled=false,
no active lease and unchanged lastStarted=2026-10-27T22:49:28.961764Z. No new worker
cycle was observed. Zero-replica scaling will not be used again here.

No migration, source-grant change, task/queue clearing or manual business write
test is part of the rollout. Normal collector startup/ingestion is not claimed
to leave all metadata unchanged.

## Publication and hosted acceptance

Four logical source commits contain prompt assets/corrections, API/cache recovery,
Calendar placement and worker packaging. Shared guides and immutable records will
be committed before the final clean source packages are prepared. Package hashes,
remote commit parity and hosted receipts will be added after actual completion.
No successful application upload is claimed yet.
