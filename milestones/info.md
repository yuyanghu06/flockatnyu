# Milestone journal

`milestone.md` is the authoritative rolling state and next-session handoff.
`to-do.md` tracks priorities, completed work, and explicit cancellations.
`history/` holds append-only records of every meaningful role pass.
`m0-agent-workflow/` describes workflow setup acceptance.
`m1-campus-map/` describes the local map implementation milestone.

The orchestrator is the sole writer of shared journal files and serializes
specialist reports into them. New multi-pass milestones receive their own folder
guide; their current status remains authoritative in `milestone.md`.

m2-campus-refinement/ tracks user-directed camera bounds, wider coverage and photo-informed Paulson modeling.

M3 tracks campus detail models, Gould Plaza and Tech@NYU color proposals in m3-campus-details/.

M4 tracks Kimmel, corrected Silver Center identity and plaza planting; see m4-campus-details/.

M5 tracks reauthorized Courant/Stern window details with unchanged colors in m5-window-details/.

M6 tracks attributed streets, sidewalks and mapped park paths/surfaces; the user's authorization supersedes the earlier road exclusion.

M7 tracks the user-reported asphalt flicker during zoom and pan.

M8: m8-gcasl tracks the dedicated Global Center model and outstanding visual acceptance.

M9: m9-presentation tracks map-only styling, effects, atmosphere and camera constraints.

M10: m10-park-vegetation tracks deterministic plantings over actual mapped park coverage.

M9/M10 resumed after a blocked human-requested checkpoint. See rolling snapshot for current camera research and vegetation integration/verification.

M11: m11-atmosphere-navigation tracks shared sky/fog blend, reverse focus exit, screenshot-guided default and neutral Union Square context restoration.

M12 memory and frame workload tracking lives in m12-memory/.

M13 loading screen tracking lives in m13-loading/.

M14: m14-supabase-setup tracks preparation versus authenticated connection; not complete until scoped connectivity verified.

M15 assistant scaffold and the dev snapshot publication are tracked in the rolling snapshot; Git publication history records the successful origin/codex/dev push.
