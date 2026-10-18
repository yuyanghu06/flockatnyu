# M40 asset consolidation evidence

Independent tester evidence for relocating retained source assets under `assets/`.
The application and assets were not edited by the tester.

`asset-audit.json` records the 540-file baseline audit, exact permitted metadata
substitutions and all 125 resolved source URLs. The original baseline was supplied
at `/tmp/techvisualized-asset-baseline.json`. The three metadata JSON changes only
add the `assets/` location prefix and refresh the dependent streets JSON hash;
the other 537 files are byte-identical.

`production-smoke.mjs` runs against a frontend production preview at port4179,
intercepts every API route and writes `browser-results.json` plus desktop/mobile
and focus screenshots here. It checks loading, current geometry against M31,
pointer hover/click, full and merged-part lift, focus/return and viewport behavior.

The five copied historical geometry/camera checks only change relative source
imports and evidence destinations so older evidence remains immutable. Their logs
and redirected JSON live here and under `offline/`. The GCASL check retains its
known historical eleven-landmark assertion and fails against the current nine;
the current browser count and complete geometry comparison pass separately.

Build logs and `tester-report.md` distinguish executed results and limitations.
