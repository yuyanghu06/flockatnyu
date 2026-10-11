# M9: Map-only presentation

User requests an unobstructed map, no hover labels, glow/lift, neutral context
buildings, a natural sky and soft boundaries. Preserve detailed building palettes
and the user's server. Personal-site source could not be found in the accessible
YuyangSite/yuyangGPT checkout (a Python project); effects are an approximation.

Camera mapping confirmed by user: A/B are tilt endpoints, C is distance only.
Polar limits from the supplied vectors are 0.00688542069 to 0.84345299301 radians
(0.39451 to 48.32630 degrees from vertical). Default/max distance is 434.29432001m.
Retain previous target/azimuth and clamp starting tilt to A. Allow closer zoom and
unrestricted azimuth. Wheel controls and restore validation share configuration.

Implemented pending independent checks: hidden overlays, complete-root glow/lift,
context gray, gradient sky, distance fog and world-space edge fading. Tests and
review are independent; runtime/browser appearance remains unverified due to
access denial. Prior production build was blocked by EPERM on an existing asset.

Initial independent pass: 10/10 checks, evaluator accepts source with no material defect. Corrected sky draw-call wording. User then supplied https://github.com/yuyanghu06/yuyang-site.git; actual reference lookup/adaptation supersedes provisional hover provenance and requires focused retest.

Reference update: GitHub personal-site source retrieved at964408fb988786be80005dc8e59e81bc19f657d3. Replacing provisional halo/emission approximation with source-derived merged additive surface glow, pulse and whole-root hover lift. Reference idle behavior can draw one overlay per landmark (eleven); this supersedes provisional two-active-decoration budget. Focused retest pending.

Final source state: actual personal-site surface-glow/lift adaptation replaces the provisional halo. Independent11/11checks pass (transforms, equations, original-material preservation, reduced motion, camera and shader/static integration). Read-only evaluator accepts source with no actionable defect. Browser/GPU/performance and production-build acceptance remain pending; no visual parity is claimed. See docs/hover-reference.md for exact sourcecommit and deviations. No server change, push or deployment.

Latest user steering supersedes source idle/selected glow and preserve-azimuth focus. Glow is only currenthover; leaving hides immediately. Click/scroll-in frontfocus is per-landmark with smoothboundedcamera, ordinarydiscretezoom andfinefocusedzoom. Hover13/13 and revisedcamera9/9 sourcechecks pass; pointerroutingreview pending. User approved prior presentation live, not the newer interactionchanges.

Current implementation supersedes prior fixed-duration focus: critically damped target/orbit/log-radius springs, persistent retarget velocity, raw elapsed time and optional reduced motion. Front65degreefocus/78degreefocusedlimit; overviewlimitsunchanged. Blank deselect eases back, native pinch restored. Independent updated tests pending.

Accepted source/geometry handoff:15camera+7input+13hover checks pass; independent evaluator reports no unresolved material implementation defect. Actual browser input/appearance/GPU and build remain blocked, so this is not full visual acceptance.
