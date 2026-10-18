# Loader speed at 1.5 times the prior rate

Focused verification of a timing-only change from 3200ms to 3200/1.5ms. Geometry,
palette, blur, static SVG and startup behavior remain preserved.

`native-speed-results.json` records the actual Chrome period, fixed 192 paths and
phase-color advancement along both routes. `rendered-speed-results.json` proves
exact repeated endpoint pixels and exact equality to prior contour frames at
matching normalized phases. It also records unchanged static/startup hashes.

`prior-emitted-animation.svg` preserves the pre-change production asset copied
before this build. `speed-only-source-comparison.json` verifies that only cycle
timing and descriptive cycle text changed, with all 192 delays scaled correctly.

The frontend build and nine startup checks pass. Previous lifecycle/reduced-motion
tests were not repeated because their sources and static asset are unchanged.
No temporary server was launched. See `tester-report.md` for exact commands.
