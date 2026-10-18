# Bobst two occupants

- Local timestamp / acting role / milestone: 2026-10-17T16:49:35.355808-04:00; orchestrator; map presence labels.
- Requested scope: replace the temporary Bobst occupants with only the two people explicitly selected by the user.
- Starting state: five temporary planned Bobst entries with stored labels; other buildings preserved.
- Work performed: resolved the two existing trackable identities, conditionally updated only Bobst people_here to exactly those two, with blank labels initially and refreshed24hour validity. No person/profile or catalogue edits.
- Decisions: retain the current local UI fixture provenance/status; do not infer activity labels.
- Checks/evidence: fresh database read confirms exactly two selected identities, blank labels and intended expiry; every other building row unchanged. No runtime tests needed for data-only change.
- Resulting state: requested two-person Bobst population saved and verified.
- Handoff: subsequent user supplied explicit labels; apply them without renewing expiry.
