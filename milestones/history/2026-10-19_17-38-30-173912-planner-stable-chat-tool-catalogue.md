# Stable chat tool catalogue contract

- Acting role / scope: independent read-only planner and orchestrator; user authorized removing wording-based tool filtering after the Calendar parser repair.
- Starting state: clean codex/dev4002929; prior Calendar wording patch live on web760b075f.
- Findings: Calendar request definitions and execution used calendarChatIntent; attendance request definitions also used requestsChatAttendance. Other inspected catalogues were stable. Calendar parsing also drove trusted-authorization progress claims and early-stop/fallback branches.
- Decision: remove Calendar wording-derived exposure and execution authority entirely. The model interprets current request/conversation and source boundaries; backend retains Google grant, fixed calendar, validation, request-only writes, revisions, supported-event restrictions and receipts. Progress records observed execution facts, not inferred user authorization.
- Additional scope: attendance catalogue becomes wording-independent; existing service declaration, literal identity/date and source/team execution policies remain. No new schema/source grants/OAuth scopes.
- Checks: repository inspection only; no new model call, source write or test run in this planning pass.
- Ownership: coder owns assigned runtime/tools/guides; tester owns assigned regression files; orchestrator owns docs/journal/model probes/release.
- Acceptance / handoff: implement stable catalogues and model-driven completion, independently verify backend gates, exercise real model against synthetic-only Calendar including no-edit/ambiguity/injection cases, deploy reviewed web package and verify live boundaries.
