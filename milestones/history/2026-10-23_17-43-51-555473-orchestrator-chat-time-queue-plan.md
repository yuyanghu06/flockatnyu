# Chat local times and Spotlight queue planned

- Acting role / milestone: orchestrator / chat-time-spotlight-queue.
- Requested scope: fix chat using UTC clock values for local times and allow queued Spotlight messages.
- Starting state: codex/dev at690d6fc; existing local documentation edits and untracked historical journals preserved. Main/dev synchronization and isolated-tool release are complete per current snapshot.
- Evidence: browser already sends its IANA timezone and prompts already warn about UTC. Map write arguments still accept model-calculated offsets. Read-only hosted query confirms the latest Stern presence ends2026-10-24T03:00Z, actually11PM New York onOctober23, instead of requested7PM (23:00Z). No hosted writes performed.
- Plan: chat-only local-clock write fields converted by server using IANA rules, exact unchanged raw boundary preservation, derived local times in read/applied results; keep shared worker/storage contracts intact. Add in-memory FIFO Spotlight queue with removable pending messages, sequential history, explicit stop/failure pause/resume, attachment preservation and bounded mobile layout.
- Ownership: backend coder owns chat map adapter/prompt/result projection and focused time tests; frontend coder owns assistant JS/CSS/guide and browser queue tests. Planner is read-only; independent tester/evaluator follow implementation. Orchestrator owns shared tracking and integration. Specialists may not spawn children.
- Acceptance:7PM New York saves the correct summer/winter instant; unchanged event/person facts survive; DST gap/fold and raw retag attempts do not write. Actual-model checks use configured inference only with simulated map stores and hard request cap. Browser checks exercise FIFO, removal, stop/failure, attachments, close/dispose and compact viewports.
- Status: plan accepted for implementation; neither code fix nor deployment is complete. Existing business data is unchanged.
