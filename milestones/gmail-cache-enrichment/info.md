# Raw sender enrichment at 9 AM Eastern

Goal: a separate scheduled service reads original contacts_cache senders, looks up each email through Treg and stores the native enriched object only in Contacts. Cache rows remain unchanged.

User explicitly replaced the initial cache-backwrite plan. Revised050 uses metadata-only jobs/global state and atomic contact/completion writes. Private full-call logs retain their separate seven-day authorization. Production runs at9AMAmerica/New_York includingDST via UTC13/14 candidates and a local-hour guard, drains finite batches and exits. Budget/failure guards remain visible.

Status: complete and deployed.36focusedchecks, API/package and independent review pass.050hosted as20261026225556; finalRailwaydeployment11646098SUCCESS, private/data volume ready, usertokenconfigured, read-onlyreadinessready. FirstcandidateOctober27,2026at9AMET. No paid/off-hour/manual run claimed; naturalprovider outcomes and multi-session lock behavior remain unverified. Current handoff and full receipts are in the rolling milestone.
