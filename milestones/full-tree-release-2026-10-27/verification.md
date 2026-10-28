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

Five logical commits, including shared records, are published on
origin/dev/tool-api-services at 8718a1c909fc0122cda69b4f4391f2cca169a819. The normal
pre-push hook ran full CI successfully from the isolated full-dependency checkout;
the initial main-checkout missing-executable failure was not bypassed. Original
HEAD and remote tracking ref match; main is unchanged.

Clean exact-commit packages are independently accepted. Counts: web 524,
worker 174, Discord 37, Gmail 18, enrichment 15. Archive and extracted bytes, all 412
unique committed source/prompt/container files, generated locks/manifests and
COPY/dockerignore coverage match. All 182 frontend artifacts match tested output;
dist/docs/color-schemes.html has supplemental SHA-256
b756c2e9aafbd76cd73fa71546cf5d13f5713920814ccea27288fe04d7d432a6.

BSD tar initially added AppleDouble resource-fork records on macOS. Artifacts were
regenerated with COPYFILE_DISABLE=1 before any upload; final exact member counts
and no-private/no-link/no-traversal/no-AppleDouble checks pass. Root source and
prompt bytes were unchanged. Archive hashes and upload directories are in ignored
package-index.json. All five application uploads and hosted receipts are now recorded below.

## Hosted completion

All five packages for source commit 8718a1c909fc0122cda69b4f4391f2cca169a819 reached
Railway SUCCESS. The following IDs match the accepted upload/archive receipts.

| Service | Deployment | Outcome |
| --- | --- | --- |
| web | `f6958635-8858-49d6-ad7d-c324feb27dbb` | Live; health/auth/exact assets/read-only API checks pass |
| discord-events | `b7a20484-b720-4c23-b9d3-64459ed41532` | Gateway resumed; chat ready and listening |
| gmail-events | `a52989c1-302e-4008-bebd-7d218802fe5a` | Listening/ready; public health 200 |
| update-agent | `7e493f9d-52f4-4990-bd35-ec9a4452a2e2` | Deployed and disabled; no running/crashed replica or lease |
| gmail-enrichment | `5af35f23-134a-4af3-be67-0c4930f4a95c` | Ready for existing cron; no job forced |

Web passes 28 hosted checks, including exact index/eight JS/CSS files,
authentication/private denial,40-tool catalogue/configuration, Contacts/map reads
and protected Miro broker. Discord logs confirm resumed gateway/chat readiness;
Gmail logs ready and public health 200. These checks invoke no model or business
write tool. Normal collector startup/ingestion remains authorized.

Worker status is disabled, with zero running/crashed replicas, no lease and
unchanged lastStarted=2026-10-27T22:49:28.961764Z through final pre-receipt readback.
No new production cycle was triggered by the rollout. Enrichment is cronReady;
no job was forced. Existing cron 0 13,14 UTC and NEVER restart and500MB volume remain; actual
build logs confirm its Dockerfile/entrypoint. Web retains its existing 5,000 MB
volume. Regions, grants, other variables and source/queue/task data are preserved
except the deliberate worker activationfalse and the corrected region incident.

Independent final hosted evaluation ACCEPTS the recorded rollout. Complete
business workflows, nine prior worker operation gaps, prior planner findings and
existing dependency advisories remain separately qualified. The location fix is
deployed, but its intended E-Lab placement has not been applied by a new cycle.

Source8718a1c is the deployed application revision. Later documentation-only
receipt publication changes no runtime/package bytes and needs no redeploy.
Final Git/remote parity and worker guard metadata are retained in the ignored
release evidence. The worker must stay paused until a new user instruction.
