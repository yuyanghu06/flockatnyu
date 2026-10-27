# Full-tree Railway release with update agent paused

User scope: commit and push the entire current tree, then deploy all five
services to Railway. Do not run another production cycle. The development branch
is dev/tool-api-services; do not silently merge main. Full-tree authorization
includes accepted private operation API/cache changes, Markdown prompt assets
and corrections, Calendar location matching, tests and project documentation.

The update agent is deliberately stopped and configured disabled before rollout.
The no-cycle boundary applies to both ordinary and manual planner execution.
Keep its existing queue/tasks/lease data untouched; no forced cycle or live
business write test is part of verification. Collectors retain normal ingestion.
The scheduled enrichment package must start outside its entire 09:00–09:59
America/New_York window and keep its scheduled/cron/NEVER settings.

Build all five source-only packages from a clean checkout of the exact checked
commit. Keep secrets, source logs, .env, Git data, evidence and node_modules out
of uploads. Preserve volumes/private variables/source grants; apply no SQL
migration automatically. Full CI and browser gates, independent review, commit/
push parity, package hashes, hosted readiness/auth/assets and disabled-worker
receipts are completion criteria. Report worker deployed and paused, not active.

Current state: complete and independently accepted. Source8718a1c is pushed on
dev/tool-api-services and all five exact packages reached Railway SUCCESS. Web
health/auth/assets/read-only API checks and collector readiness pass. Scheduled
enrichment awaits its existing daily slot. Update-agent is deployed but disabled;
no new production cycle was triggered. Existing broader workflow/dependency
limitations remain. A documentation-only receipt follows the source commit.

[Checks, boundaries and deployment IDs](verification.md).
