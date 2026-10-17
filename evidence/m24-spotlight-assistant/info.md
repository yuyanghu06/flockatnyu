# Floating assistant verification

Independent M24 tester evidence for the compact Spotlight assistant, paired local
runtime, and campus interaction regressions. All tester provider and repository
requests use loopback HTTP fixtures with fake keys; no live model or database was
called by these tests. The real Vite proxy, Hono API, configured provider adapter,
map geometry, camera, and Chrome browser are exercised.

- `browser-results.json`: 13 Spotlight acceptance checks, request/cancellation
  counts, ports and limitations. Desktop/mobile PNGs show collapsed, empty,
  streamed response, offline and long scrolling states. HTML-like reply and link
  labels are deliberate safety fixtures and display literally.
- `assistant-results.txt`: 34 assistant/provider/repository checks, including
  bounded connection checks, abort, gateway errors and native-dialog fake DOM.
- `dev-runtime-results.txt`: paired startup/proxy/custom ports, SIGTERM cleanup,
  occupied API preservation and Vite failure cleanup (3 checks).
- `wasd/`: 17 Chrome regressions covering camera easing, merged Stern/Gould
  hover/selection/alignment, and modal input isolation with map recovery.
- `building-views/`: 23 broader building framing and modal wheel regressions;
  no uncaught errors or failed asset requests, actual initial load 7513ms.
- `interrupted-hmr-results.json` and `interrupted-hmr.png`: initial exploratory
  run interrupted by another agent's Vite hot reload. This is environmental
  evidence, superseded by the stable-source passing run.

Reproduce from the repository root:

```
npm run test:assistant
node --test tests/dev-runtime.test.mjs
node tests/spotlight-browser.mjs
```

For map-only regressions, start a separate Vite server and set `MAP_URL` and
`MAP_EVIDENCE` when running `tests/keyboard-pan-browser.mjs` or
`tests/building-view-browser.mjs`. Those tests intercept assistant status and do
not call a live provider. Installed headless Chrome is used; physical mobile
keyboard, touch, trackpad and other-device performance remain untested.
