# Table labels plan

- Local timestamp / acting role / milestone: 2026-10-17T16:38:02.012941-04:00; planner; map-presence-labels.
- Requested scope: all presence display text must come from table values, with a separate label field in people_here JSON.
- Starting state: six-field entries, provenance-derived debug response/UI captions and fixed catalogue ACLs through022.
- Work performed: read-only planner reviewed schema, API/UI, script and tests; no edits/cloud operations.
- Decisions: required seventh string label, blank allowed/max200Unicode code points; ordered blank backfill; API passes label unchanged, removes isDebug; frontend safely displays label only. Source matching remains authorization only. Explicitly label five existing fixtures without renewing expiry.
- Checks/evidence: inspected all current write paths; only fixture script active. No tests claimed.
- Resulting state: accepted bounded backend/schema/frontend/test assignments; preserve map visuals and022 ACLs.
- Handoff: implement023 and independent tests, applyonlynewmigration and CASfixturelabels.
