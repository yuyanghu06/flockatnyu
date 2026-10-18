# Live tool status and conversation display

Goal: show actual tool work during chat generation with a clear conversation UI.
Scope: existing retrieval lifecycle callbacks, NDJSON/client validation, tool rows,
message bubbles, status shimmer and safe Markdown. Completion requires true early
start events, trustworthy final/cancel states, preserved source access, bounded
records and passing protocol/UI tests. Implemented and verified locally with
synthetic adapters over real HTTP; no live model or deployment is claimed.
See the rolling snapshot/history for exact evidence and later visual revisions.
