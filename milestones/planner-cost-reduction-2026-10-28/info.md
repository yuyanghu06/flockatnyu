# Planner cost reduction

## Goal

Implement the approved retry, prompt-reuse and selective-context improvements while preserving correct updates and unfinished work. Arrange a follow-up after a few days of use.

## Scope and boundaries

Persistent service-only retry metadata must not rewrite task payloads, original inputs or expiry. Preserve source/identity/lease/exact-version checks, separate named service operations, existing model/settings/call budgets, private logs and held fragment-ID/audit-cleanup work. Prompt/provider changes must be gated for compatibility. Existing user/provider-guidance and spending-review edits are preserved.

## Completion criteria

Independent implementation review and meaningful deterministic/inference tests must establish restart/failure retry behavior, changed-input eligibility, context preservation and supported provider wire behavior. Record actual cost before/after without promised savings. Standard CI must pass before any push. Keep implementation, migrations, hosted rollout and normal trial activation distinct.

## Status

October28 user explicitly requested deployment. Logical implementation commits are prepared; source integration, separate055application and exactmain release are in progress. Fresh production configuration shows the worker is already enabled; preserve normal activation/settings and do not force a test cycle.

Local implementation complete and independently ACCEPTED. Exact final frozen CI passes3075/0fail/2optional skips; all5browserchecks pass. Durable retries, reusable directOpenAI prompt/schema layout, conservative earlier read retirement, metadata reporting and two narrow prompt corrections are in place. Independent offline checks and the final exact-copy actual-model case pass. Baseline source298b7d0, source pins and all failed evidence remain private. No hosted migration, deployment or activation yet.

## Next action

The user now authorizes deployment. Verify055first, integrate/publish the exact reviewedmain release, deployonlyweb+worker and record actualnormaltrialstart. Do not force a manualcycle. The October31follow-up uses actual deployment/use boundaries, and must report insufficient post-change use if not yet deployed.

[Accepted plan](../history/2026-10-28_12-05-16-311024-planner-planner-cost-reduction-contract-accepted.md).

## Follow-up

Heartbeat review-flock-planner-spending-after-three-days is ACTIVE on a72-hour interval from October28 11:59AM NewYork. It will compare actual post-change use around October31, disclose an undeployed/short trial, and pause after delivering its one-time review. It cannot activate/deploy/run planner cycles or change business data.

## Reporting pass

The durable metadata-only report now reproduces the original $24.36014988 baseline exactly. Independent offline report cases and scoped formatting/lint pass. It does not fetch source/model-output content or change any service. Raw metadata and baseline output remain in ignored evidence. [Reporting pass](../history/2026-10-28_12-09-01-329847-orchestrator-planner-spend-report-implemented.md).

## Implementation and verification

- [29-48-114203-coder-durable-planner-retries-implemented](../history/2026-10-28_12-29-48-114203-coder-durable-planner-retries-implemented.md)
- [29-48-114204-coder-planner-cache-context-and-copy-fixes-implemented](../history/2026-10-28_12-29-48-114204-coder-planner-cache-context-and-copy-fixes-implemented.md)
- [29-48-114205-tester-planner-cost-real-model-comparison-recorded](../history/2026-10-28_12-29-48-114205-tester-planner-cost-real-model-comparison-recorded.md)
- [29-48-114206-evaluator-planner-preservation-finding-resolved](../history/2026-10-28_12-29-48-114206-evaluator-planner-preservation-finding-resolved.md)

The final clear attendance case completes in6actualmodelrequests and preserves every unrelated field, including exact Calendar URLs/IDs/manualnotes and priorparticipants/buildingrelations. Its estimated$0.003286565 versus the correct baseline8requests/$0.007600115 is a smallsample, not a production savings percentage. Across all baseline/candidate/final gates,74HTTPrequests cost an estimated$0.045485045; simulated-source outcomes and original failures/cap-limited completion remain explicit.

The earlier default browser attempt lacked Playwright's bundled binary. Repeating with the already-installed GoogleChrome passes all5 flows, with simulated business services. No browser/toolchain source workaround or installation was needed.

## Rollout prerequisites and limits

Migration055 is additive and local only; apply it separately before the new worker. Existing task payload/version/expiry and raw sources are unchanged. New workers fail before inference when retry RPCs are missing. The existing source/runtime budgets and model stay unchanged. Source rollout and worker activation are separate; no normal live trial has started in this chat. Record exact deployment/trial start before interpreting the scheduled October31 comparison.

The retry marker survives crashes before checkpointing. A crash after a history-only save but before retry forwarding leaves the old-version marker and allows the newer saved version to be eligible; this favors edit/version safety over an atomic cross-version delay.

## Final local acceptance

Final frozen CI exits0 with3,075passing checks, zero failures andtwo optional skips. Allfive browserflows pass with installedChrome. Independent evaluator ACCEPTS the local implementation;13runtime/migration hashes remain unchanged. [Evaluator acceptance](../history/2026-10-28_12-32-55-248615-evaluator-planner-cost-reduction-local-accepted.md) · [Local completion](../history/2026-10-28_12-32-55-248616-orchestrator-planner-cost-reduction-local-completed.md).

Current changes are in the working tree on codex/planner-cost-reduction. They have not been committed, pushed, applied to hosted SQL or deployed by this task. Keep that distinction explicit before the later few-day production comparison.

[Deployment plan](../history/2026-10-28_13-10-16-211658-planner-planner-cost-deployment-planned.md).
