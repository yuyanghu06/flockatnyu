# Camera navigation

## Front views and unchanged limits

`building-views.js` records camera offset directions in map X/Z: north
`[0.5421,-0.8403]`, east `[0.8403,0.5421]`, south/west their negatives.
Kimmel, Global Center, Bobst and Leslie eLab use north-facing frontage;
Silver Center and Courant use west; Lipton and Paulson use east; the arch
uses its south park-facing side; Stern uses the east Gould-facing rotunda;
Gould uses its north open approach. These model-based choices follow existing
facade code and the measured plaza layout in `gould-plaza-reference.md`.
They are presentation directions, not surveyed access bearings.

Focus uses a complete world bounding box expanded vertically ±4.5 m for hover
motion. Sphere radius divided by the sine of the smaller effective horizontal
and vertical half-FOV, times 1.12, provides conservative framing. Aspect and
camera zoom are included. An oversized portrait fit remains capped by the
global maximum and may therefore crop. Front polar angle is 65°; focused
maximum is 78°. Overview A/B angles, minimum angle, global C distance cap,
pan bounds, ground guard and default pose remain unchanged.

## Focus and reverse-focus behavior

The first valid focus records the pre-focus overview target, orientation and
distance. Switching between landmarks preserves that same return pose. The
first outward wheel event while focused **reverses the focus journey to that
saved overview pose**, using the same spring rate as focusing. This supersedes
the earlier distance-threshold/pitch-only outward exit.

Further outward events during that return do not restart or retarget it. The
input controller suppresses the remainder of the same outward gesture even
if the return finishes before its trackpad tail. After a 180 ms event gap, a
new gesture can resume ordinary overview zoom. Focused context and expanded
tilt range clear only when the return settles, preventing a premature clamp.

A primary pointer press or controls start cancels motion with `preserveOverview:true`,
so clicking another building does not erase the saved overview. A real pointer
drag of at least five pixels cancels and invalidates the old snapshot. A
secondary pointer contact also invalidates it immediately: native two-finger
pan/pinch is manual navigation, even though it has no primary click candidate.
The focused tilt range remains available for the native gesture. After
manual navigation, a subsequent focus captures a new overview; its pitch is
bounded to the overview interval. If outward exit occurs without a valid old
snapshot, the current target/distance are retained while pitch returns within
overview limits. Native pinch remains enabled; `reconcile()` at gesture end
requests the same saved overview return when distance reaches 92% of the cap.

## Wheel accumulation and fixed overview levels

The previous input gate forced a full step on a fresh 1 px event, dropped
events below 80 accumulated pixels or within 70 ms of the last action, and
reset remaining input across short gaps. That caused unequal treatment of
trackpad tails and mouse bursts even though the camera spring retained velocity.

Every normalized wheel delta now reaches `zoomDelta(pixels)`: line units use
16 CSS pixels and page units use viewport height. During an ordinary gesture,
pending log-distance changes by `pixels * 0.002`; focused inward fine motion
uses `pixels * 0.0008`. There is no fresh-event full step, action throttle or
discarded remainder. Direction reversals subtract from the same pending goal.
Fine/ordinary mode stays fixed for the gesture.

At 180 ms idle, `endZoomGesture()` settles ordinary navigation to the nearest
fixed level in log-distance: 15, 30, 50, 80, 120, 180, 260, 350 and the configured
maximum (~434.2943 m). Focused fine gestures keep their continuous destination.
A tiny ordinary gesture may settle back to its starting level rather than force
an entire step; that deliberate quantization is distinct from losing input.
`zoom(direction,{fine})` remains available for explicit discrete commands.

## Spring model

Research sources: [Unity SmoothDamp](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Mathf.SmoothDamp.html),
[Three MathUtils](https://threejs.org/docs/pages/MathUtils.html), and
[Mapbox animation options](https://docs.mapbox.com/mapbox-gl-js/api/properties/#animationoptions).
Our implementation uses the exact critically damped scalar solution, not a copy
of Unity's implementation or Mapbox's flight curve:

`e=x-goal; c=v+w*e; x'=goal+(e+c*dt)*exp(-w*dt); v'=(v-w*c*dt)*exp(-w*dt)`.

Components are target XYZ, continuous shortest-arc azimuth, polar angle and log
distance. Rates are 10/s for focus/return, 12/s ordinary zoom and 9/s fine zoom.
Retargeting preserves velocity. No wheel notch restarts an ease-in. A log-radius
stopping envelope bounds velocity between `-w*(x-log(min))` and
`w*(log(max)-x)` before each step, preventing inherited momentum from crossing
the hard zoom limits and then being abruptly clamped.

Positive finite delta is used without a frame cap. Zero/negative/nonfinite delta
is a no-op; extreme finite delta settles safely. Position tolerance is 0.001 m,
angle/log tolerance 0.00001, velocity tolerance multiplied by rate. Bounds apply
every frame. The fixed-goal spring is frame-rate independent; manual controls,
input-event timing, quantization and active constraints are separate influences.

Starting motion saves the visible pose, drains OrbitControls deltas, restores
the pose and holds damping off until completion/cancel. Active retargets do not
drain again. Reduced motion optionally snaps to goals on the next valid update.

## API and ownership

`createCameraFocus({camera,controls,limits,constrainPan,reducedMotion})` exposes
`focus(root,id)`, `zoom(direction,{fine})`, `zoomDelta(pixels)`,
`endZoomGesture()`, `update(dt)`, `cancel({preserveOverview})`, `clearFocus()`,
`reconcile()`, `leaveFocus()`, and getters `active`, `focusedId`, `returning`.
`leaveFocus()` uses the saved reverse-focus journey on deselection. `clearFocus`
is immediate reset/restore cleanup. Invalid roots leave state unchanged.

`map-interactions.js` owns wheel capture, normalization, idle flush, gesture-tail
suppression and click/drag distinction. It prevents duplicate native wheel
dolly while leaving native touch pinch available. Main retains scene integration,
frame scheduling, camera configuration and reset/restore wiring.

## Verification evidence and limits

Inline Node/Three checks reproduced and validated: all nine irregular wheel
events `[1,2,4,8,12,8,4,2,1]` were delivered (42 pixels) with one idle flush;
a fresh 1 px event at distance 180 moved to only 180.04389 after 50 ms and
settled back to 180, rather than forcing the next level. A 2,400 px burst never
exceeded 434.29432; sampled approach increments decreased from approximately
0.00515 to 0.00247 m over five successive frames. Switching two landmarks then
scrolling outward restored the saved original pose and target within 1e-6;
repeated outward events did not restart return (92 frames at 60 Hz in that trace).

Earlier checks cover 30/60/144 Hz equality for a fixed goal, invalid delta,
manual cancellation and damping restoration. Independent tester traces provide
broader acceptance. No browser/server was launched by this coder. Synthetic
continuity and event accounting do not establish perceived visual smoothness.
