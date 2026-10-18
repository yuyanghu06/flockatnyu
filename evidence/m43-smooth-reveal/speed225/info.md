# Runtime color speed225% verification

This bounded pass verifies the second50% speed increase for the CSS masked startup colors: previous period2.1333333333s becomes1.4222222222s, or2.25times the original3.2s speed. It changes neither the ordered1100/1000ms reveal nor the static reduced-motion fallback.

Run `node evidence/m43-smooth-reveal/speed225/probe.mjs` against the existing source-dev server at127.0.0.1:5173. The probe launches and closes its own headless installed Chrome, intercepts APIs, and holds the real main module so the loading state remains observable without loading map geometry. It records both discs' computed duration/direction/timing, transforms, palette/mask references, reveal constants and current relevant file hashes. PNGs capture actual logo pixels before/after400ms in normal and reduced-motion modes.

`browser-results.json` includes the executed browser results plus the offline Pillow pixel comparison. Normal mode changes35832pixels above a10channel threshold; reduced images are identical. `tester-report.md` gives acceptance and the baseline limitation. No source/test edits outside this evidence folder, build, preview, backend calls or full unchanged suites were performed by this tester. Parent owns the build and shared journal.
