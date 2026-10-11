# Camera spring independent tester report

`node tests/camera-focus.mjs` exits 0: **15/15 checks pass** against the current exact critically damped implementation. Tests use actual Three camera and OrbitControls with null DOM.

Verified all 11 configured front angles, focused 65-degree view / 78-degree orbit cap, overview range restoration, shortest arc, projected full transformed bounds with lift margin in portrait and landscape, distance/target clamps, retarget continuity, damping restoration, fine zoom and discrete destination accumulation. Equal elapsed-time poses at 30/60/144 Hz match within 1e-8. Repeated same-goal focus preserves the reference trajectory; wheel retarget preserves inward motion. Invalid deltas are no-ops, extreme finite frames settle safely, reduced motion settles immediately, and leaveFocus smoothly deselects without a pose jump. Pose comparison uses numerical tolerance to accommodate floating-point roundoff.

Synthetic pointer/wheel routing separately passes 7/7, including native pinch enabled and controls-end reconciliation. These replace earlier fixed-duration and 35-degree expectations; old initial result is historical. Tests establish configured direction math, not the visual correctness of facade choices.

No browser, server, network or GPU check performed. Actual touch behavior and perceived smoothness remain unverified. Oversized targets cannot fit fully if the configured maximum distance prevents it.
