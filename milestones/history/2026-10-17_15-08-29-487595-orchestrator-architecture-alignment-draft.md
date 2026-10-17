# Architecture alignment draft after cleanup

- Local timestamp / acting role / milestone: 2026-10-17_15-08-29-487595 America/New_York / orchestrator / architecture discussion.
- Requested scope: after housekeeping, align the overall site architecture and repository documentation.
- Starting state: cleanup complete; source238a346 and documentation48ad290 committed locally, no push. Remaining tracked changes are unrelated map/UI work.
- Work performed: added docs/architecture.md with verified current components, five-table database boundary, proposed flow and unresolved deployment/data contracts. No implementation, schema or infrastructure change. Added documentation index link.
- Decisions: proposed target is explicitly not a completed implementation or user-approved final architecture. Keep existing source-access/blacklist boundaries. No memory migration.
- Checks: read current code/configuration and accepted M38 evidence; no additional tests warranted for documentation-only draft. Hosted Gmail health/auth/flags verification is final. No independent specialist or source send/model call.
- Acceptance / remaining work: cleanup accepted; architecture discussion is active. Ask user to confirm separate chat/automation deployment and single-repository direction, then revise the authoritative architecture document. Existing native/browser verification limits remain.
