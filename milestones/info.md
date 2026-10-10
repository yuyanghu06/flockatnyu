# Milestone journal

`milestone.md` is the authoritative rolling state and next-session handoff.
`to-do.md` tracks priorities, completed work, and explicit cancellations.
`history/` holds append-only records of every meaningful role pass.
`m0-agent-workflow/` describes workflow setup acceptance.
`m1-campus-map/` describes the map milestone now handed off to another assistant.

The orchestrator is the sole writer of shared journal files and serializes
specialist reports into them. New multi-pass milestones receive their own folder
guide; their current status remains authoritative in `milestone.md`.
