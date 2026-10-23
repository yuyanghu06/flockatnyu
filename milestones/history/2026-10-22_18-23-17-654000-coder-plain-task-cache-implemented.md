# Plain saved-task reads implemented; source frozen

- Local timestamp / acting role / milestone: 2026-10-22T18:23:17.654000-04:00 / coder report integrated by orchestrator / plain-task-cache-read.
- Requested scope: separate cached task reads/bookkeeping from live source/action tools.
- Starting repository state: accepted tool-error continuation awaits combined release; planner contract accepted.
- Work performed / changed files: coder changed server/automation/staged-pipeline.js, adapters.js, prompt.js and info.md. Cached eligibility is synchronous (shape/scope/expiry/trusted originals); source/reference/Calendar callbacks removed. Catalogue does not bind tasks; explicit task read binds saved originals in RAM only. Defer requires every UUID from current cycle or a read/current-version task. Prompt names standard source/Calendar/map tools for later work. Parent updated AGENTS.md, notes and automation/prompt docs.
- Decisions: standard action-tool access/original/identity checks and targeted completion verification remain; no schema/tool/budget changes. No source observation is created by cache reads.
- Checks and evidence: coder156targetedpass/3obsolete assertions pending tester update; new cache tests pass; API build/whitespace pass. Parent separate122pending-task/staged-handler/deterministic/member/manual-scope/tool-error/prompt checks pass and build passes exit0. No live business calls. Source frozen for review.
- Resulting state / acceptance: implementation ready for independent final verification; three old live-revocation-on-cache expectations assigned to tester, no implementation defect established.
- Remaining work and handoff: independent final tester/evaluator, broad regression, frozen package verification and worker-only rollout/startup.
