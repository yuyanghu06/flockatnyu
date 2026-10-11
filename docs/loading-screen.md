# Initial loading screen

Only the loading screen uses the new black/white style. Its title is Tech Visualized. Two small inline SVG gears use pale faces and offset hatched sides, informed by the supplied screenshot. No fonts, images, dependencies or second WebGL scene are fetched for the design. The reference site could not be opened with the available web tool; the screenshot was inspected directly.

The opaque screen exists in initial HTML outside the inert, aria-hidden map app. Its essential black fixed positioning is inline to prevent geometry pop-in before application CSS arrives. All other screen styles are scoped to #loading-screen; existing map CSS and camera configuration are unchanged. The two gears rotate smoothly in opposing directions only while loading; readiness/failure pauses them. Reduced-motion disables rotation. The native enter/retry action is a rounded white pill with dark text and distinct hover/focus. No descriptive tagline is displayed; the title and required loading/ready/error status remain.

## Readiness and entry

bootstrap.js loads the map through a caught dynamic import. loading-state.js is a pure, single-use state gate. main.js registers the actual job total, counts every completed job and wraps LoadingManager itemStart/itemEnd so nested resources count too. Any loader or preparation failure permanently denies entry until reload. Jobs completing with failures are not success.

After jobs finish successfully, main waits for compileAsync, submits the complete initial scene with renderer.render, and waits two animation frames before sceneReady. This is a prepared/submitted first frame, not proof of GPU completion. Readiness still requires zero pending nested resources. There is no fake progress or timed reveal. The Enter button is both hidden and disabled until ready. A late resource revokes readiness.

The user must click/tap the native Enter button, or activate it by keyboard. Ready focus moves to the button; Enter dismisses the overlay, removes app inert/aria-hidden, enables controls and focuses the canvas. Continuous rendering starts only on entry, avoiding GPU work behind the waiting screen. The initial canvas was already rendered beneath the opaque screen.

## Failures

Required model/nested resource failures, startup import errors, WebGL creation/context loss and shader compilation failures show an error with Retry loading. A separate inline fallback handles failure to download the entry module itself. A 120-second no-state-progress watchdog offers retry for stalled startup, never success. Retry reloads the page for a clean scene and resource state. A late graphics failure restores the opaque error screen and disables controls.

## Validation limits

Tests cover readiness ordering, nested and late resources, explicit entry, terminal failure, counters, DOM focus/inert/error state and source integration. No browser screenshot, actual WebGL shader run, network throttling or physical keyboard/touch result is claimed. Existing browser denial and streets-parks.glb build realpath permission limit remain; user's server is untouched.
