# Standard interface text

The shared --ink token is pure black (#000000). Normal map, note/itinerary,
assistant and admin text use it; startup also declares it before modules load.
Accent/semantic states and contrasting text on filled controls retain their roles.

# Current administration boundary

Discord administration configures live-readable channel metadata. It has no archive date, retention claim or backfill control. Disabling a channel prevents reads and event ingestion; migration020 preserves that intent through discovery. The assistant reports live Discord/Google/Miro readiness without retired generic knowledge storage status.

# Campus map application

`map-presence.js` and `map-presence.css` display borderless circular portraits.
Overview uses the cached 128px actual-mesh silhouette and distance-field packing
in `map-presence-layout.js`. Building focus instead scatters portraits across the
left 44% of the viewport using one stable random seed per focus session. Focus diameter is 37.5%
of the largest viewport grid's diameter; it changes with occupant count. Polling
preserves layout, animation and person-focus state. Position easing is 30% longer
than before (~0.87s to cover 95%); size easing remains ~0.67s. No per-frame grid
snapping. Overview containment/spacing applies to destinations; portraits can
cross constraints during continuous transit. DOM overlays lack scene occlusion.

Focused avatars show persistent Instagram-style activity notes with softly inset edges, a 16px body-to-portrait gap and small tail
dots; note size decreases with occupant count. Text comes only from table labels,
with blanks hidden and three-line visual truncation; accessible names retain the
full label. The old hover profile card is removed. Clicking a person while the
building is focused brings their portrait to the left region's centre, enlarges it 1.5× and dims
others. Clicking again/outside or Escape clears person focus. Native keyboard
activation and aria-pressed remain available. Overview has no avatar hover state.

Portraits retain soft raised-edge shading, no lens distortion and original image
assets/URLs. The inner wrapper alone owns the staggered bubble entrance. The solid inset itinerary panel follows 20px right of the clicked person, listing
the selected current location and authorized active/future plans, with New York dates/times and
truthful empty/unavailable states. Interacting with it retains person focus and
scrolls the panel independently. Notes have two detached tail dots, with clear
gaps from the body and between dots. `map-avatar-url.js` accepts only exact
same-origin `/api/map/people/<person UUID>/avatar` URLs bound to the displayed
person. Current map markers and event attendees share this resolver and retain
initials when images fail. The authenticated API streams private Supabase Storage
portraits, so new people do not need a frontend rebuild. Approved bundled artwork
remains a temporary fallback for older profile rows during backfill. Protected
API access, polling/foreground refresh, expiry and failure clearing remain
unchanged. `camera-focus.js` now shifts selected buildings to the
right using complete projected bounds and a 25% pullback (within distance limits),
preserving front direction, angle profiles and overview return.
See docs/map-presence.md and docs/camera-navigation.md for current contracts.

`window.__map.presence.refresh()` and `.snapshot()` provide a small verification
seam without credentials or a fabricated roster fallback.

`main.js` loads and renders the local Washington Square scene, owns map interaction
and the small HTML interface. `assets.js` explicitly imports 110 nearby
city tiles and the chosen campus assets, so production builds include this bounded area.
`config.js` centralizes the palette, initial camera and factual landmark records.
Neutral context buildings use #fdfaf0, sampled from the most common portrait
background corner color; existing 3D lighting and atmosphere still shade it.
Asset placement metadata remains authoritative under `../assets/yuyang-site-3d-assets/`
and `../assets/campus-assets/`. Vite imports and model URLs resolve from those folders.
`geometry.js` contains boundary-inclusive Coles geometry removal and camera input
validation. `style.css` controls responsive layout.
The grass export contains several parks in one mesh; triangle filtering restricts
it to the campus radius. Resize handling is active throughout asset loading.

Run `npm run dev -- --host 127.0.0.1` at the repository root. `npm run build` creates
the production preview; `npm run preview -- --host 127.0.0.1` serves that build.
The map has free orbit, pan and zoom. Selection preserves the current camera;
Focus on building is optional. Camera angle opens exact JSON export and restore.
Copy it and send the JSON with angle feedback. If clipboard access fails the
selected text can be copied manually. Camera dimensions adapt to the viewport.

The user's supplied camera determines only the starting 240.9752133-meter zoom
distance. The start retains their target and uses a campus-facing oblique angle;
no angle is locked during navigation. Tiles span X -960..960 and Z -960..1152.
Pan targets stay within X -430..430, Z -430..650 and Y 1..150 meters, with a
15..700-meter camera distance. The inset retains surrounding context. At a pan
boundary, camera and target translate together, preserving zoom and viewing angle.
Ground safeguards keep the camera above ground. Camera restore rejects views
outside these limits with a helpful message; valid saved views round-trip normally.

The scene uses Washington Square coordinates in meters, Y up. Generated models
load at identity; original Bobst and arch assets use their recorded transforms.
The procedural Paulson model is already in map coordinates
and receives no additional placement transform; its complete geometry shares the
same selection root. The original extracted source asset remains unchanged.
Coles triangles are removed only in the recorded tile, using
the complete recorded footprint, its boundary and height range. Paulson is an
architectural approximation with a podium and separate detailed towers. No roads, traffic,
backend, integration or fabricated club activity is included.

The read-only `window.__map.snapshot()` exposes load state, errors, camera, landmark
bounds, detail counts, navigation limits and frame draw counts for verification.
`project(id)` supplies a landmark’s
screen-space bounds center; it may be occluded by another building.

M3 modules: silver-towers.js, leslie-elab.js and gould-plaza.js build merged, selectable photo-informed architecture. main.js handles source replacement and registration; config.js contains all nine landmark records.

M4 correction: silver-towers.js is retained as an unused historical implementation; main.js no longer imports it or removes tower source geometry. Active target is silver-center.js, alongside kimmel.js. Gould now includes requested planter trees and shrubs.

M5: courant-stern.js adds merged window frames, mullions and sills to existing Courant/Stern roots before registration. Source meshes/material colors remain unchanged; no new facade palette or glass planes. The current shared generator supports synchronous offline exports and an asynchronous runtime wrapper with an 8ms budget, yielding between components and attaching completed details atomically. main.js awaits enhancement before readiness.

M6: streets.js and parks.js generate offline street/park geometry. scripts/build-streets-parks.mjs bakes the model; main.js loads the result, replacing old coarse grass.

M7: main.js biases only the background ground plane behind street surfaces; streets.js removes asphalt beneath crossings instead of using near-coplanar overlays.

M8: global-center.js replaces exactly88 GCASL source triangles with six merged meshes, preserving Kimmel and neighbors. main/config register nyu-global-center as the eleventh landmark.

M9: atmosphere.js adds sky and edge haze; landmark-effects.js applies a steady white highlight to complete landmark roots. config.js contains exact camera samples and shared limits. Generic city materials are neutral; detailed model palettes remain intact.

Final M9 effect follows yuyang-site commit964408f: merged additive surface overlays with hue/pulse, selected suppression and4.5mhover-only lift. This supersedes provisional sprite halos/emission. Decorations are separate nonpickable scene roots; underlying landmark materials remain unchanged.

Current selection preserves the steady white fill and adds both a selected union silhouette (landmark-outline.js) and an ordinary ground footprint band (landmark-footprint.js). They enter together over330ms without moving the building; the ground band expands outward through owned morph targets. Outline rendering follows the unchanged beauty render before avatar projection. Authoritative footprints are reused where available; Bobst/Courant base hulls are conservative approximations; Stern instead preserves the union of source contours11005 and11632, including its separately elevated front wing and concavities, with Gould excluded from the ground footprint. Hover fill retains its two-material pool and at most two crossfading views; no lift, pulse or source-buffer mutation is introduced. Starting an outward camera return clears selected indicators on its first frame through normal selection state, preserving hover and the ongoing camera transition. Explicit world-space Arch/Paulson footprint metadata prevents double placement, and reduced-motion completion stays latched when normal motion resumes. camera-focus.js owns front focus, bounded scripted motion and focused tilt; map-interactions.js owns captured wheel routing while native pinch remains enabled. M10 park-vegetation.js is an offline generator; main.js loads its merged GLB at identity.

M11: atmosphere.js replaces texture sky with one analytic triangle matching fog rays/output color; camera-focus.js stores pre-focus overview for reverse exit; map-interactions.js preserves wheel deltas. config.js default matches supplied park-foreground composition. assets/main restore neutral25UnionSquareWest and235ParkAvenueSouth models and neutralizeLipton, retaininggeometry.

M12: map-resources.js compacts neutral context buffers exactly and freezes static local matrices; main.js caches picking and exposes bounded timing diagnostics.

The pastel @ loading view uses two static SVG alpha masks over the original
static logo. Each mask clips a prepainted conic-gradient disc; only each disc's
transform rotates, keeping the silhouette fixed and avoiding SVG segment repaints
or video loop seeks. Inline CSS presents the white view before modules; bootstrap
warms mask decodes with a bounded timeout and gives it two paint opportunities.
loading-state.js retains real resource/scene readiness. map-startup.js keeps the
app inert through READY while startup-visual.js sequences logo zoom/fade, then
white fade, and only then enters. Failures/new pending resources cancel stale
reveal work. Reduced motion uses static artwork and skips reveal.

- assistant.js / assistant.css provide the floating Spotlight assistant after automatic campus readiness: native modal, conversation above the composer footer, platform-specific Command/Control+K, focus restoration, editable offline drafts, streaming/cancellation and safe sources. chat-client.js owns the bounded HTTP/NDJSON transport and truthful connection failures. Closing preserves unfinished replies; see docs/assistant-backend.md for server setup and boundaries.

M16: discord-admin.js/css and discord-admin-client.js power the standalone /admin.html channel settings page without loading the map. API authorization stays on the server; no credentials or grant management are exposed in the browser. chat-client.js enforces aggregate history/UTF-8 budgets.

M19: building-views.js configures screenshot-derived original azimuth/polar and height factors for eight buildings. camera-focus.js derives the lower viewing angle while retaining the original full-building zoom distance, following the user's zoom feedback; it uses the full-building target except for Stern's rotunda presentation anchor. map-interactions.js shares focused outward wheel return between canvas and window, with native overlay scrolling outside focus and loading gates.

Stern uses a view-only rotunda anchor with the original full-building zoom; its earlier explicit close distance is removed. Off-canvas outward return preserves hover coordinates and does not introduce picking.

M20 decorative loader is removed at the user’s request. M21 keyboard-pan.js provides camera-relative bounded WASD with typing/modal/modifier/blur guards. Bobst and Silver profiles use distanceScale1.2. main.js registers Stern and Gould geometry as one Stern root; the plaza no longer has a separate building record. Snapshot part bounds expose grouping alignment for verification.

M23 keyboard-pan.js integrates eased ground-plane velocity for smoother starts,
releases and direction changes. Cruising speed is 60% higher (24–192 m/s), with
normalized diagonals and existing pan bounds. Short release tails stop within
250 ms; safety guards, pointer/wheel/control takeover and camera restore/focus
clear held keys and momentum immediately. Captured wheel reset covers overlay
returns, and held-key repeats cannot resurrect movement after a reset. See
docs/camera-navigation.md for the rates, exact integration and handoff contract.

M24: main.js suspends the captured map-wheel path while a native dialog is open. This lets the floating assistant scroll independently; keyboard-pan already guards dialog[open].

M24 client connection checks time out after eight seconds. Gateway/network errors use bounded actionable messages; status/configuration checks never invoke a model.

M31: Lipton Hall remains loaded at its original placement with neutral context
materials. Its entry is removed from the selectable `config.js` building list,
so it has no picker option, selection root, hover effect, focus target or debug
landmark lookup. Its meshes still occlude buildings behind it during raycasting.

M32: chat-client.js samples the browser's IANA time zone at every chat send and
includes `timeZone` in the request body. Changes during travel apply on the next
request. Detection failure explicitly uses UTC; the server validates the zone and
uses it for date-based Discord window interpretation. Message/building context
and stream cancellation retain their existing contracts.

Kimmel has a left-side framing override in building-views.js; other profiles retain the default right band. The itinerary person name is centred in its panel header.

Date-only upcoming plans display the New York date and “Time not specified” rather than fabricated midnight appointment times. Future plans never create current map markers before validity begins.

The itinerary title is centred and reads Schedule. Its person name and copy use standard black, with no timezone footer. Current location appears first; full-width rows use single-line subtitles combining time/location and activity. Active windows receive a darker yellow fill without an outline; date-only plans use their New York day. A short scale/opacity bounce plays on opening or person switches, respects reduced motion, and does not replay on data refresh.

Schedule rows now show a stylized building portrait left of the name/time/activity. A Vite glob maps all nine stable building IDs to local256px WebP thumbnails from assets/building-portraits; originals and exact prompts remain there. Rows use56px images (40px mobile), accessible adjacent text and safe image failure handling.

The assistant launcher and dialog identity use the transparent raised pastel @ PNG from assets/branding/tech-at-assistant.png. Launcher white is #FDFAF0, matching the avatar background; images are decorative alongside accessible text.

Assistant launcher hover/keyboard focus mounts the matching animated SVG; leave/blur/disposal removes it and restores PNG. Image loading failure and reduced-motion preferences retain the resting mark.

Building activity cards now contain scheduled events only, without the former People there today roster. Opening/switching buildings reuses the schedule380ms pop-in; data updates preserve animation state. Assistant launcher also pops in when campus entry reveals it. Both honor reduced motion.

Base building focus now adds a right-side inset activity card with scheduled
events. The parallel conversation's newer events-only request removed the initial people
list; people remain as avatars. Empty buildings retain the card; failures have
explicit unavailable text. Avatar clicks open the existing person Schedule instead. The
focused avatar frame is capped at480×640CSS pixels inside the left44%, keeping
seeded positions independent of camera movement. Existing overview layout and
parent-thread individual Schedule styling/animation are preserved.

Building activity omits the decorative current-date subtitle. The centered Scheduled events heading sits16px below the building name in light gray (#8a8a8a); individual event date/time metadata remains visible.

Event rows support source-authorized attendee profiles from the map API, rendering right-side circular local portraits with name alternatives and initials fallback; current presence is independent.

The building activity card centers its Scheduled events section heading.

Assistant composer has no keyboard hint, context/ready footer or Clear chat.
Offline error/Retry appears inline only when unavailable. Empty input uses an
ivory send button; enabled send uses logo pastels with a white arrow (white square while busy). Hover/focus
rotates a clipped color layer at the logo loop speed without rotating the arrow;
reduced motion stays static. During generation the same button shows a square
and stops the request, preserving the draft without triggering a new submit. The native dialog
pops in over380ms on every opening; reduced motion removes animation. Selected
building context remains part of requests even though its badge was removed.

Assistant panel and launcher share #fdfaf0 ivory and two inset edge shadows using
avatar highlight/shadow colors through --assistant-surface/--assistant-edge.
Building activity empty-state paragraphs are centered with their section heading.

Building-event time/location use separate lines in a metadata group, with2px
spacing and consistent12px text. Long text wraps naturally.

The assistant dialog and launcher have no outer border; inset shadows define their edges.

The assistant header reads Flock@NYU without a subtitle. Long thought-bubble
width constraints use --note-anchor-size from the final target portrait diameter,
so text starts with settled wrapping while the avatar size/position eases.

Normalized event projection preserves the map UI API. Parser capacity now matches100building/2000event bounds; all-day scheduled labels use the event timezone. Individual Schedule includes future returns to the currently focused building. Existing camera/geometry and concurrent user styling changes are preserved. Source provenance remains backend-only; notes/labels render as plain text.

Assistant dismissal uses180ms scale/fade while retaining its native modal backdrop;
Escape/close/outside click share it. Immediate failure/disposal bypasses motion,
and reopening cancels an in-progress exit. Message/input/source/error changes
batch a measured280ms height animation, rebasing from the visible size and keeping
the top edge fixed. Reduced motion skips both effects. Event titles are14px
semibold;12px date/location lines stay2px apart with24px between events.

Conversation replies are labeled FlockBot in black inside a left-aligned soft white
bubble. User messages have compact right-aligned inset ivory bubbles with an
accessible You label, without a visible role caption. Send/stop stays at the input
area’s top while text wraps. Per-call gray blocks show real tool lifecycle events;
Only Running/Thinking shimmer; all terminal statuses and reduced motion stay static.
`assistant-markdown.js` renders streamed assistant Markdown through markdown-it,
with raw HTML disabled, credential-free HTTP(S) links and no remote image loading.
User input remains plain text. Tool rows expose names/statuses, not arguments or
source contents; pending rows stop on cancellation/error.

Assistant controls have no exterior focus outline; keyboard focus uses a subtle
button brightness change and thicker link underline instead.

Building event rows now include all authorized known event kinds without category icons (the user cancelled them). Weekday/date/time are bold, room notes strip only a recognized repeated building prefix, and mobile attendee portraits flow below details, with tall cards reserving space above the fixed assistant launcher. Category metadata is not used to load images.

Event date/time uses #737373 gray through the event-time class.

Completed tool checks are centered CSS strokes, independent of check glyph font
metrics. Transcript has24px desktop/22px mobile bottom padding and explicit
scroll anchoring control. New content follows the bottom throughout measured
height animations; idle manual scroll remains usable. Composer resizing follows
only if already at the bottom. Animation-follow frames are cleaned on close.

Tool status shimmer is restricted to Running; Done, Partial result, Failed, Stopped
and Interrupted remain static. Thinking also shimmers unless reduced motion is set.

Focused avatars are draggable with primary mouse/touch pointers after5px movement;
ordinary clicks still toggle Schedule. Pointer capture tracks outside movement,
and release clamps the complete portrait/thought bubble into the existing focused
frame using `map-presence-drag.js`. Outside drops ease back faster; reduced motion
clamps immediately. Valid targets persist through polls for a focus session and
reset on leaving building focus. Selected people can move with their Schedule.
Rebuild/cancel/blur/Escape/dispose clean active capture. These positions are purely
client-local and never change source activity/location records or the camera.

The chat stream client accepts bounded tool-1 through tool-30 progress for dependent source fallback and map update workflows; tool progress can precede metadata. Status metadata is selected by event type, not stream position.

The composer footer remains outside the transcript scrollport, keeping scrolled
bubbles above the footer and the panel’s lower inset at every scroll position.

Assistant streaming coalesces Markdown/DOM work per animation frame with terminal flush/disposal guards. Map polls retain identical marker nodes; card presentation caches invalidate on semantic revision, selection and exact time boundaries while animation/positioning remains live.

Spotlight dismissal hides the panel without cancelling active requests. Hidden
updates set a pending latest-scroll flag consumed on reopen, with completed
responses retained in history. Explicit Stop, loading failure and disposal still
abort. Send/Stop hover/focus adds a subtle glow; color rotation is driven by active
streaming rather than hover, and reduced motion remains static.

The assistant supports a file picker, removable attachment chips/image previews, image paste and file drop using chat-attachments.js and the browser-safe server contract. PNG/JPEG/WebP, PDF and small UTF8 text/code are retained only in in-memory conversation/draft state; current attachments survive send failure. A successful map/attendance tool completion emits campus-map-updated so map-presence.js refreshes immediately. Closing the dialog still preserves in-flight streaming.

The assistant transcript appears above its composer footer. Only the transcript
scrolls through long conversations; input, upload chips and errors have bounded
heights on short viewports. Streaming follows readers already at the bottom;
scrolling back pauses following. Existing send/stop colors, loading animation,
dismissal and background completion remain. `assistant-presentation.js` selects
the Mac Command or Windows/Linux Control shortcut, suppresses desktop shortcuts
on mobile platforms, and retains a compatibility helper for readable Miro source labels. Answer
inline citations now supply their own labels; no metadata footer is rendered.
Composer animation clearance is capped by the current viewport; browser and
visual-viewport resizing remeasure the footer so a retained multiline/upload
draft stays accessible when the available height changes.

Map refreshes coalesce agent write notifications behind an older pending read, guaranteeing a subsequent read begun after the saves. Transient read failures recover with at most two consecutive retries after1/3seconds; authentication denials do not retry. Failed reads still clear stale activity, and disposal cancels retries. Ordinary polling/visibility recovery remain.

Assistant replies render only the answer’s safe inline citations. Retrieval metadata remains available to the server but is no longer blindly appended as a footer of unrelated search candidates or Calendar events.

## Go Greek temporary popup at 683 Broadway

`broadway-683.js` extracts the exact 70 source faces of the southern W 3rd Street tower (BIN1008629) from tile-1_1, then merges its image-informed masonry/windows/cornice/garden/tank into one vertex-colored selectable mesh. `go-greek-popup.js` is the single enable switch and display/camera manifest. While enabled, `main.js` dynamically imports the model, removes those same tile faces and registers 683-broadway as Go Greek; config/building-views conditionally include its local label and independent southeast focus. Disabling skips all popup hooks and preserves the original tile. Adjacent complex geometry/source exports are preserved. The visual flag is independent of the backend catalogue row, separately added by owner migration037. See docs/683-broadway-model.md for import and database-safe removal instructions.

Active-event signals live in `map-event-indicators.js`: original personal-site canvas exclamation, shared softly flashing gold borrowed-geometry overlay with a small marker bounce (both static for reduced motion), complete cached root bounds and exact active-window reconciliation. `map-presence.js` supplies the full authorized catalogue/clears failures; main owns lifecycle. Generic across buildings; preserve this module when retiring Go Greek. See docs/active-event-indicators.md.

Selected-building framing now uses `map-focus-layout.js` as the shared camera/card contract: desktop buildings fit left of the card; compact cards move below them with assistant clearance. `camera-focus.js` solves complete perspective bounds, widens the lens smoothly only when distance caps prevent a compact fit and restores the overview lens. Per-building facade angles remain; the former Kimmel-only screen-side override is removed.
