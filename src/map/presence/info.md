# People and activity displays

`map-presence.js` owns the page lifecycle, polling triggers and public read-only
snapshot. Its private `view` instance connects `map-presence-elements.js` (DOM and
state), `map-presence-content.js` (event cards and schedules),
`map-presence-markers.js` (avatars and dragging), `map-presence-frame.js` (frame
layout), and `map-presence-refresh.js` (bounded presence HTTP reads).

`map-presence-helpers.js` validates data and prepares bundled portrait lookups.
Layout, drag bounds and person-bound avatar URL validation remain independent.
`map-event-indicators.js` renders active scheduled-event signals. CSS keeps
marker rules before cards. Never treat a provider failure as an empty successful
read or expose unapproved avatar URLs.
