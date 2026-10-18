# Bobst explicit activity labels

- Local timestamp / acting role / milestone: 2026-10-17T16:49:35.355809-04:00; orchestrator; map presence labels.
- Requested scope: set the two occupants' labels to the exact user-provided activity text.
- Starting state: Bobst contains exactly the two selected people with blank labels.
- Work performed: conditional people_here-only update changed each label to its corresponding supplied string. No identity/source/status/validity fields or other building rows changed.
- Decisions: preserve exact case/spelling from the user and existing expiry. Keep private identity/activity details in operational table data rather than tracked reports.
- Checks/evidence: fresh read matches both intended labels and all prior fields/expiry; other building rows unchanged. No source/schema/runtime changes or test reruns.
- Resulting state: both explicit labels saved and verified; table-driven UI will use them on its next read.
- Handoff: no remaining work for this data update; agent write tools remain a separate unimplemented task.
