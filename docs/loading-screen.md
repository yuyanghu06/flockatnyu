# Automatic campus startup

The white fullscreen loading view presents a large centered pastel @ without a
visible caption. A static transparent SVG overlay adds a soft raised edge, contact shadow and sheen over the moving colors. Loading status remains available to assistive technology. The
original static SVG preserves the exact silhouette beneath two static SVG alpha
masks, one for the outer spiral/stem and one for the inner letter loop. Each mask
clips a prepainted conic-gradient surface. Only the child surface's transform
rotates, clockwise outside and counterclockwise with reversed colors inside, in a
1.422222-second loop (another 50% faster than the previous 2.133333-second loop). Gradient stops, masks and the @ shape remain fixed. This
avoids animated SVG segment paints and main-thread-dependent video loop restarts.
SVG/GIF/MP4 assets remain separate export previews.

The mask coordinate system is the original 1254px square. Rotation centers are
(637,605) outside and (612,628) inside. The inner gradient starts at
190.18662976 degrees to align color phase at the stem junction (765,628).
Surfaces span twice the mark's square so rotation always fills their masks.
Vector mask sizing remains responsive; no additional CSS blur or raster
upscaling is introduced. The source masks retain their designed soft route
coverage inside the authoritative silhouette. Only rotating children receive will-change.
The artwork renders 320–440px wide on desktop and up to 360px on mobile.

Critical HTML/CSS appears before application modules, with static artwork always
available beneath the masks. Hidden image references warm the same mask resources.
Bootstrap bounds mask decoding at 500ms, then gives two animation-frame paint
opportunities bounded by 150ms before importing heavy map preparation. These are
upper bounds, not fixed waits. Missing masks or unsupported masking leave the
static mark; decorative resources never establish map readiness.

The overlay is outside the initially inert app. `map-startup.js` retains the
existing `loading-state.js` job/resource/prepared-scene gate. `main.js` awaits
successful jobs, shader compilation, an initial render and two presentation
frames. This establishes a prepared/submitted frame, not GPU completion.
Courant/Stern facade work now cooperatively yields between components through the
same geometry generator, yielding between complete components at a soft 8ms
budget while preserving atomically attached details and real readiness.

Only genuine READY starts the reveal. The compiled canvas becomes visible under
opaque white (`aria-busy=false`), while the app remains inert and the gate stays
READY. The @ grows to scale 3 while fading over 1100ms, with color transforms
continuing throughout; then the white overlay fades over 1000ms. Only afterward
does the gate enter, release inert, dispatch `campus-enter`, enable navigation and
start map rendering and the assistant. There is no CTA or fabricated progress.
Reduced motion selects static artwork, pauses color transforms and skips reveal,
including when the preference changes during either phase.

`startup-visual.js` owns cancellation and reveal. `STARTUP_REVEAL` supplies CSS and
fallback durations. Transition-end events advance phases; bounded timers handle
missing events. New pending resources restore opaque white/artwork and invalidate
stale callbacks. Failure cancels reveal, restores white, hides/stops artwork and
focuses readable Retry/error text. The existing 120-second loading watchdog stays.
An inline module-download fallback runs before Vite's generated entry and restores
the same failed/inert/not-busy state without application code. No JavaScript shows
a static explanatory message. Retry reloads the page. SVG/ICO favicons remain
independent. Existing earlier loader evidence remains historical.

Current verification must inspect real changing color pixels during natural map
loading and reveal, alongside readiness, cancellation, failure, reduced motion,
responsive/DPR sharpness and production bundling. Animation flags alone do not
establish smooth visible playback; shared GPU contention remains measurable.

The optional `tech-at-raised-relief-v7.svg` contains only static shadow/highlight output derived from the exact accepted v5 outline. Direct paths define its clip; group references inside clip paths are avoided for Chrome compatibility. It has no per-frame filters or JavaScript. Missing relief hides only that image and leaves normal readiness/color motion usable. The favicon embeds the same relief in a still SVG and uses mark scale 0.8 (20% smaller than the original) inside the existing rounded white badge.
