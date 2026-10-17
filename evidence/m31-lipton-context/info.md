# M31 Lipton context browser evidence

Independent installed-Chrome verification that Lipton remains visible ordinary context while other campus landmarks retain hover, selection and camera focus.

- `browser-results.json`: seven executed checks, actual camera/geometry/material measurements, ray-hit coordinates and limitations.
- `lipton-context-clicked.png`: actual Lipton geometry after five real mouse hover/click pairs, with no glow or selection.
- `stern-school-of-business-selected.png` and `bobst-library-selected.png`: real click selection/focus regression captures.
- `tester-report.md`: independent pass and practical limits.

Reproduce with `node tests/lipton-selection-browser.mjs` against local Vite5173. API routes are intercepted; no model/backend calls occur. Read-only Chrome debugger scope inspection exposes actual scene references without source instrumentation.
