# Google source access contract

- Role: planner; user requested allowing planner Google reads and using hello@techatnyu.org for Gmail.
- Starting state: Drive skill deployed, but worker Google gate false because native Gmail source omitted from its allowlist.
- Work/decisions: User explicitly authorized hello@techatnyu.org Gmail and Drive access, superseding the initial Drive-only proposal. Existing Google gate controls both read families. Append the exact configured Gmail source UUID to only the update-agent shared allowlist; no new source row, schema, credentials or source-code change. Preserve other entries and write boundaries.
- Checks: Read-only inspection;60/60 Google/Gmail/Drive-skill tests passed. Actual source/account and live reads delegated to orchestrator.
- Boundaries: no sends/Drive edits/sharing; Drive still supplies no Calendar/map write provenance. Existing authorized Gmail evidence handling remains unchanged. No monodrive-only ancestry enforcement is claimed.
- Handoff: verify new release and real read-only Google tools; independent evaluate, refresh status and publish journal.
