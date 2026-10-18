# Table labels frontend

- Local timestamp / acting role / milestone: 2026-10-17T16:38:02.012943-04:00; coder; map-presence-labels.
- Requested scope: all avatar captions from table-provided label.
- Starting state: UI inferred Test/planned/self-reported captions.
- Work performed: frontend coder changed src/map-presence.js/.css and sourceguide: requiredlabel, textContentbadge/detail/aria, genericlabelclass, blankhides, fulltexttitle/wrappingdetail.
- Decisions: no source/status/isDebug display inference; names/buildingnames use existing table fields. Preserve portraits/fans/anchors/camera/refresh/expiry/error behavior.
- Checks/evidence: syntax, scopedwhitespace, retiredcaptionsearch andfrontendbuild PASS; no browser/cloudchanges bycoder.
- Resulting state: frontendreadyforindependentchecks.
- Handoff: bound neighboringlongbadges and verifyliteral/blank labels.
