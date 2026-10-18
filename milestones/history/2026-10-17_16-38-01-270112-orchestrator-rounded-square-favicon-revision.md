# Rounded-square favicon revision

- Local timestamp / acting role / milestone: 2026-10-17_16-38-01-270112 America/New_York; orchestrator; M42.
- Requested scope: user-directed loader and favicon refinements.
- Starting state: M43compositor source stable; circularfavicon supersededby user.
- Work performed / changed files / decisions / checks: User superseded circularbadge with squarewithroundedcorners. Builder now creates centeredwhite square with22%cornerradius andsameapprovednative-exportstill. SVG+16/32/48ICO regenerated; noPNGfavicon. Explicitper-size resampling clearsnear-zeroalpha ringing foundbyreviewer in16pxcorner, preservingAA. All3HTML iconlinks use?v=rounded-square torefreshcachedicons. Primary rebuiltsourceicons andrefreshedChrome. Freshproduction/iconreviewpending.
- Resulting state / acceptance: M43accepted; finalM42iconverificationpending.
- Remaining work and handoff: finishrounded-squareiconchecks andintegratejournal.
