# Automatic campus startup

The user removed the decorative loading screen. There are no gears, orbiting
phrases, fullscreen entry overlay or “Click to enter” CTA in the application.
Only a small bottom-left “Preparing campus…” status appears during real loading;
it disappears when the map opens automatically. A recoverable failure shows a
message and Retry loading. Prior M13/M20 screenshots remain historical evidence.

index.html contains this notice outside the initially inert app. It can also
report failure to download bootstrap itself without requiring the app module.
map-startup.js uses the existing loading-state.js job/resource/prepared-scene gate,
automatically calling enter only when the gate is actually ready. main.js still
waits for successful jobs, compileAsync, a complete initial render and two
presentation frames. This establishes a prepared/submitted frame, not GPU
completion. There is no timed reveal or fabricated success.

Automatic entry releases app inert, hides the notice, dispatches campus-enter,
enables controls and starts map rendering and the assistant. That event name is
retained for existing consumers; it no longer requires a user click. Canvas
visibility is hidden while aria-busy is true to avoid incomplete geometry flashes.
Asset/import/WebGL/compiler failures or a120-second stall deny entry, disable
navigation and show retry. Late graphics failure restores the retry notice.

The gear UI/CSS, keyframe authoring tool and obsolete gear tests were removed.
Current tests are tests/map-startup.mjs and tests/map-input-browser.mjs. Actual
held/failed model requests and automatic entry are verified in Chrome; evidence
is in evidence/m21-map-input/. Direct checks were performed by the primary agent
per user instruction, without independent specialists or live model/API calls.
