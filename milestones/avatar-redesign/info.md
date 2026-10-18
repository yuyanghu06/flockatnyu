# Building avatar redesign

User-led visual iteration implemented by the primary without specialists. Overview portraits use actual-mesh silhouette packing with world-relative sizing. Building focus uses stable per-session random screen scatter at 37.5% viewport-grid diameter. Movement takes 30% longer (~0.87s for 95%); size easing remains ~0.67s. Activity notes use an Instagram-style bubble above each focused portrait, scale down with occupant count and hide blank table labels. There is no old hover profile card.

Clicking a focused person centres/enlarges them and dims others; click again, outside or Escape clears person focus. Camera focus presents the building toward the right, preserving free space to its left. Original portraits retain soft raised edges without lens distortion or URL changes. Building-activity view is a saved future requirement, not implemented.

Build/syntax and direct seeded scatter/spacing/desktop-mobile framing checks pass. User visual testing remains pending. DOM avatars lack scene depth occlusion; mask sampling uses synchronous GPU readback. Overview destination containment can be crossed during eased transitions. Legacy roof-fan/hover assertions are superseded. Current truth lives in the rolling snapshot.

Latest framing: focused scatter/person focus stays in the left44% of the view; complete building bounds are fitted on the right with a25% camera pullback, subject to existing distance caps. This supersedes viewport-wide scatter and the fixed target offset.

Person focus now includes a solid inset itinerary panel 20px right of the avatar, listing authorized future planned locations at other buildings. The protected read API separates current/upcoming entries;16API tests and both builds pass. Existing backend runtime needs restart; old API yields explicit unavailable. Thought-bubble tail dots are detached with clear gaps.

Explicit owner future plans are now stored and verified through the restarted dedicated4187/3127 feed; no early map markers. Normal interface text now uses shared black --ink.17API tests and both builds pass; separate5173/3001 runtime preserved.

All9selectable buildings now have generated faceted portraits matching people avatars. Scheduled rows show local thumbnails left of names/time/activity. assets/building-portraits retains originals, compact WebP versions and exact prompts. Build,9-ID/image validation and9servedassetchecks pass; user visual review pending.

Schedule now includes current location before active/future plans, with restored full-width rows and one-line subtitles. Active New York validity windows use a darker yellow fill without an outline. The panel pops in on opening/person switches, respecting reduced motion and preserving refresh stability. Syntax/build pass; user visual review pending.
