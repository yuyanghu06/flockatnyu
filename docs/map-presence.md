# Map presence markers

The map reads `GET /api/map/presence` through the local Hono API. Overview displays borderless circular portraits within each populated building's silhouette. Clicking a building/avatar opens the building-focus view, where its portraits scatter within the left 44% of the map viewport. Positions are randomized once per focus session, remain stable through camera movement/polling, and regenerate on the next focus. Other buildings' portraits hide while focused.

`src/map-presence-layout.js` renders a 128px silhouette from a shared-geometry proxy with a plain override material. Boundary clearance/circle packing handles overview concavity and spacing; mask sampling is limited to every 90ms while geometry/camera changes. Overview size follows camera depth and the building's world size, shrinking only to fit. Focus bypasses building boundaries and derives diameter from the largest grid in that left-side region, currently rendering at 37.5% of that diameter (a further 25% reduction from the preceding 50% setting). Seeded random scattering preserves circle separation and reserves room above for notes; a grid fallback handles crowded arrangements.

`src/map-presence.js` preserves positions, layout caches and animation state across polling. Focus/overview coordinate conversions preserve pixel positions/sizes, then ease to the new layout. Position response is now 4.5/1.3 per second, giving 30% longer repositioning (~0.87s for 95%); size response stays 4.5/s (~0.67s). Intermediate movement is continuous; only destination packing enforces spacing/containment. A 340ms staggered in-place bubble entrance scales only the inner portrait wrapper. Polling does not replay it and reduced motion skips the entrance.

The rectangular hover profile has been removed. Focused avatars with nonblank activity labels show persistent Instagram Notes-style bubbles above them with a 16px clear gap and two detached small tail dots separated from the bubble body and each other. Soft inset highlights/shadows round the bubble edges to match the portrait treatment. Bubble font/padding/tail scale down with occupant count (16px × count^-0.12); long text is visually limited to three lines while the full table label remains in the accessible button name. Empty labels show no fabricated note. No pointer hover state in overview. Within building focus, clicking a person toggles an additional person focus: that portrait moves to the centre of the left-side avatar region and grows 1.5×, its note grows slightly, and others dim. Click again, click outside or press Escape to return to the building's people view. Buttons expose aria-pressed and retain native keyboard activation. Removing/expiring a focused person clears that state.

`src/map-presence.css` gives original portraits soft raised-edge shading and a small cast shadow, without a border or lens distortion. No image regeneration or Supabase URL changes. Polling every 30 seconds, foreground refresh, local expiry, failed-read clearing and bundled portrait URL checks are unchanged. Portraits remain DOM overlays without depth occlusion against other buildings. Browser/GPU performance is for user visual testing; the tiny mask readback is synchronous. Camera focus now pulls back at least 25% where distance limits permit and fits projected complete-building bounds on the right, leaving the avatar region to its left; see camera-navigation.md.

`server/map/presence.js` now reads `map_buildings` (id/name/people_here) and trackable `map_people` through two bounded service-only selects. The current `buildings[].people` output still excludes future/expired entries. A separate `upcoming` array contains only future `planned` entries, sorted by start time, with personId/buildingId/buildingName/label/validFrom/expiresAt. Both paths share exact entry validation, trackability, source allowlists, positive current-policy checks and the local-fixture restriction. No provenance, Discord IDs or emails are returned. This is a read-only API extension; no migrations or database writes. Ordinary source entries remain hidden until the current-policy callback is wired; production auth stays closed.

The itinerary heading is centred and reads “Schedule”; portrait rows have no divider, and there is no timezone footer (dates/times still use New York). When a person is clicked, a solid cream itinerary rectangle with the person name centred at its top appears 20px immediately right of the avatar, follows its movement, and uses soft inset highlights/shadows. It lists the selected current location first, other active locations and authorized future plans in time order, with source-provided activity text and times in America/New_York. Subtitles combine location/time and activity on one line with an ellipsis and full-text title; rows span the panel as before. Active time windows receive a darker translucent yellow fill (#ffdc5a66) without an outline. Date-only plans highlight throughout their New York day; timed plans highlight only during their interval. The whole panel pops in with a short scale bounce when opened or switched to another person, without replaying on polling/content changes. Reduced-motion preference disables the animation. It shows an explicit empty state when no authorized future plans are recorded, and unavailable when connected to an older API without the new array. It is scrollable, stays open while interacting with the panel and prevents map wheel handling while hovered. Identical refreshes preserve its DOM/scroll position. Escape, outside clicks and person-toggle dismissal hide it with person focus. Data covers recorded map plans; no Calendar reads, invented locations or guarantees of physical attendance.

Restart a previously running API/dev process to load the new future-plan read; frontend HMR alone updates the panel but cannot reload that backend. The shared SQL `map_get_buildings` RPC and applied migrations are preserved, though this API now filters the raw bounded service read itself to distinguish current/upcoming plans.

## Fixed locations

Hosted migration022 (`20261017202855`) restricts runtime writes on `map_buildings` to `UPDATE(people_here)`. Building IDs, names, aliases and row creation/deletion are unavailable through runtime credentials. The existing trigger alone maintains `updated_at`; callers cannot supply it. Catalogue maintenance requires an explicit owner migration. No agent-facing map-write tools are exposed yet; future tools must preserve this same narrow boundary.

## Table-driven labels

Migration023 (`20261017203512`) adds required `label` text inside each `people_here` JSON object. It allows an empty string or at most200 Unicode code points. Existing six fields remain unchanged. Legacy entries are backfilled with `label: ""`; the five seeded Bobst entries explicitly store `label: "Test"`.

The API returns `entry.label` verbatim. The activity note and accessible label use that table value through safe text rendering. Blank/whitespace-only labels show no context. Activity badges beneath portraits were removed in the redesign. No status value or source ID/URL generates text. Names come from `map_people.display_name`, building names from `map_buildings.name`. The full stored label remains in the accessible button name; visual notes wrap and clamp to three lines.

Source IDs/links remain internal authorization/provenance metadata. The local fixture source exception still controls which entries may be read, independently of their label; changing a label never grants access. There is no `isDebug` response flag or magic display label.

## Temporary Bobst fixture

Five avatar-backed people are assigned to Bobst solely for UI debugging. The entries use `planned`, exact debug provenance and a24-hour expiry. The fixture script stores `label: "Test"`, so the focused activity note displays that exact table value; the entries are not actual location reports. No schema change, worker activation or deployment is involved.

```sh
npm run map:debug -- --apply
npm run map:debug -- --clear
npm run dev
```

`--apply` seeds or refreshes the fixture; `--clear` removes only its exact provenance. Both use conditional updates to preserve concurrent edits and unrelated occupants. Server credentials remain in ignored environment files. Restart a previously running local API after pulling these backend changes; frontend HMR alone cannot add a new route to that process.

## Verification

The current redesign received syntax/build checks and direct checks for seeded scatter stability, different-session variation, desktop/mobile circle spacing/viewport bounds and right-biased camera framing. Prior direct synthetic-mask checks cover concave overview packing and zoom sizing. The user is doing visual testing; no independent agents or browser checks ran for this pass. The existing browser script below asserts the retired roof-fan layout and needs revision before it can validate this redesign. Prior browser evidence describes the earlier layout.

```sh
npm run test:map-presence
npm run test:assistant
node tests/map-presence-browser.mjs
```

Browser checks require the paired local API and web runtime (the script defaults to port4187; override `MAP_URL`). Live checks read the hosted fixture without writing. Tracked screenshots use synthetic identities; live roster screenshots stay private under `/tmp`. A production preview is preferred during concurrent edits to avoid Vite HMR invalidating a test page. See `evidence/map-presence-ui/` for actual results and limitations.

## Owner-requested local plans and current-day map

Explicitly requested plans can be stored as planned entries using date-only New
York midnight-to-midnight validity windows. The panel shows the date with “Time
not specified”; blank activity labels remain blank. A separate exact local-plan
provenance pair is restricted to the existing owner identity and three approved
locations. Like the Bobst fixture it is hidden from production/other principals;
ordinary source-backed entries retain their existing authorization requirements.
Current avatars still require valid_from <= now < expires_at. Future plans are
never added to current building people arrays;17 API tests include advancing the
clock to confirm they become current only when validity starts.

The dedicated debug preview at http://127.0.0.1:4187 (API3127) was restarted after
the read changes; authenticated proxy checks verified three requested future
plans and zero corresponding early markers. The separate5173/3001 dev session
was preserved and may need its own restart to load the changed backend.

Black (#000000) is the shared standard text color via --ink, including notes,
itinerary copy, normal assistant copy, map controls and administration copy.

## Building portraits in Schedule

Every current selectable building has a stylized low-poly portrait generated with
the built-in image_gen tool, matching the people avatars' faceted illustration,
warm lighting and ivory background. The exact prompts and reference paths are in
assets/building-portraits/prompts.json. Nine full-resolution PNG originals and
256px WebP thumbnails are retained locally. The web thumbnails total109756bytes;
Vite includes all nine URLs, while only shown images are loaded.

Schedule rows place a56px portrait (40px on narrow screens) to the left of each
building's name, date/time and activity. Stable building IDs select local assets;
there are no remote source URLs or new database fields. Adjacent building names
provide accessible identity, and failed images are safely removed. This replaces
the row divider for buildings with portraits. Building/person data, original map
models and all person avatar URLs remain unchanged. Syntax/build and nine-image
coverage/PNG-WebP validation/preview200 checks pass; user visual review pending.

## Building activity in base focus

Base building focus shows a solid warm-ivory inset card on the right, with a
Scheduled events section. The initial two-section card was superseded by the
parallel conversation's later events-only request (20:03pass); people remain as avatars.
Clicking a current avatar opens the existing individual Schedule, temporarily
replacing the building card. Overview has no building card. Empty and unavailable reads have
different messages, and buildings without occupants still receive a card.

Focused avatars use a screen frame capped at480×640CSS pixels, centred within the
left44% of the viewport and vertically centred with24px outer clearance. Existing
seeded scatter, slower easing and overview silhouette layout remain. The right
card is capped at460px wide, scrolls within the viewport and keeps map wheel
navigation disabled while hovered. Narrow viewports retain the two-side layout.

Migration024 adds map_buildings.scheduled_events, a JSONB array of flat event
objects. The API returns only currently authorized non-cancelled events whose end
is still in the future, sorted by start, including ongoing events. Ordinary
source allowlists and a positive current-policy callback are both required; local
person/debug exceptions never authorize events. Source provenance stays private.
The runtime callback remains unwired/default-deny, so source-backed events remain
hidden until that policy integration is implemented. No event ingestion/write
adapter or fabricated event data is added by this change. All nine hosted arrays
start empty. Campus display times use America/New_York.

Hosted024 receipt20261018000104 and preservation checks are in
evidence/map-building-activity/. The isolated4190web/3130API runtime loads this
backend; existing main-thread runtimes were preserved and need their own restart
to load the new select/response fields.

## Explicit Bobst event UI fixtures (2026-10-17)

The user requested4fictional Bobst events in hosted scheduled_events. Each title starts [UI TEST]; exact dedicated provenance and ID prefixes are accepted only for local-development/nonproduction Bobst reads. Ordinary event-source authorization and person fixture exceptions remain independent. No runtime database write grant was added. Current isolated preview is http://127.0.0.1:4192/ with API3132; other runtimes preserved. Bobst card shows New York weekday/date under the title and scheduled events only (earlier People section removed). Stored test events remain until cleanup but expire from presentation by end time. Future attendee UUID arrays, possible event table and per-type SVG icons are saved in notes.md only.

Event rows now render authorized attendee portraits on the right (36px desktop/28px mobile) with name alternatives and local-asset/initials fallback. Optional attendee_ids stays in event JSON, validated by025; API presentation contains safe id/displayName/avatarUrl only for trackable people. Bobst fixtures have2/1/1/2sample participants. Automatic event-to-map placement remains deferred; these arrays never update current presence. Preview4192/API3132 now serves live attendees.
