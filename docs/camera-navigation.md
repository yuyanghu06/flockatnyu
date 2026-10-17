# Camera navigation

## Front views and unchanged limits

`building-views.js` records camera offset directions in map X/Z: north
`[0.5421,-0.8403]`, east `[0.8403,0.5421]`, south/west their negatives.
Eight building views now follow the user's screenshot-facing corners. These
azimuths and original polar angles are estimated from roof edges and adjacency;
exact camera JSON was not supplied. They are presentation directions rather
than surveyed bearings. The final image labeled Stern is interpreted as Silver
Center based on its facade and adjacent buildings; the original Stern view is
retained. Lipton, the arch and Gould retain their previous directions.

| Building | Azimuth | Original polar | Height factor |
| --- | ---: | ---: | ---: |
| Stern | 117° | 65° | .75 |
| Courant | 15° | 63° | .80 |
| Bobst | 175° | 62° | .80 |
| Kimmel | 117° | 65° | .80 |
| GCASL | 181° | 53° | .80 |
| Paulson | 110° | 46° | .80 |
| Leslie eLab | 189° | 41° | .80 |
| Silver Center | 197° | 60° | .80 |

Height factors derive the lower viewing angle in this Y-up scene. For original
polar `p` and factor `s`, final polar is `atan2(sin(p),s*cos(p))`.
Original full-building fit is retained, with a1.2 distance multiplier for Bobst
and Silver Center following the latest request to pull both farther back.
Lowering changes orientation only and no longer shortens distance.
Repeated focus does not compound the adjustment.

Focus uses a complete world bounding box expanded vertically ±4.5 m for hover
motion. Sphere radius divided by the sine of the smaller effective horizontal
and vertical half-FOV, times1.12, with the per-building multiplier above, provides conservative framing. Aspect and
camera zoom are included. An oversized portrait fit remains capped by the
global maximum and may therefore crop. Stern retains the rotunda presentation
target `[85,25,193]`, using the same full-building distance calculation as all
other views. Its earlier 94.36 m close-distance override is removed following
the user's zoom feedback. Foreground overlap can remain at the lowered angle;
the complete root remains selectable. Unconfigured views retain65°; focused
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

Window capture routes outward scrolling over panels, controls and page content
through that same return path. It consumes each event once before canvas or
overlay handlers, and leaves inward/unfocused overlay scrolling native. The
loading gate also leaves input untouched. Off-canvas return events preserve the
map's hover pointer and perform no new picking. Disposal removes both listeners.

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

## WASD panning and Stern grouping

W/S move forward/back along the current camera bearing projected onto the ground;
A/D move left/right across that bearing. Held keys move camera and target equally,
retaining height, orbit angle and zoom. Cruising speed is `distance * .8`, clamped
to 24–192 meters per second: 60% faster at every zoom than the previous controls.
Diagonal movement is normalized and delta capped at 0.1 seconds to avoid large
jumps after suspension. Existing target bounds apply, discarding velocity into a
blocked axis while retaining movement along the free axis.

Ground-plane velocity eases toward the current desired direction at 14/s, or
toward zero at 24/s after release or opposing keys. Each frame integrates the
velocity curve exactly: `v1 = goal + (v0-goal)*exp(-rate*dt)` and
`movement = goal*dt + (v0-goal)*(1-exp(-rate*dt))/rate`. This preserves velocity
through direction changes and makes fixed-goal travel independent of frame rate
within the delta cap. Release motion stops completely after at most 250 ms of
elapsed update time. Larger suspended-frame deltas count toward this cutoff,
while displacement still uses the 0.1-second cap. Invalid deltas change no state.
Main passes uncapped elapsed time to keyboard update so release expiry includes
suspended frames; the keyboard module applies the displacement cap internally.

keyboard-pan.js ignores typing in inputs/textarea/select/contenteditable, open
native dialogs, composition and Ctrl/Meta/Alt shortcuts. Focus transfer, blur,
visibility changes and disabled controls clear held keys and momentum immediately.
Key-up is captured to avoid losing a release over an overlay. Canvas pointerdown,
controls start and window wheel capture also reset keyboard movement without
consuming those events, including focused outward scrolling over UI panels.
The `reset()` API clears keys, velocity and release timing; restore and explicit
focus invoke it, and an active scripted journey clears keyboard state on update.
After a reset, a held key's repeat events cannot restart travel until a fresh
physical keydown. Manual keyboard travel cancels a scripted focus/return and
invalidates the old saved overview, like manual pointer panning.

Gould Plaza's original geometry is now under the shared Stern root. It has no
separate building record or camera profile. main.js waits for both parts before
registering one selectable root, preserving their map-space transforms, with
one set of pick meshes. Hover glow/lift, selection and complete focus bounds now
operate together. Source plaza/Stern world bounds are verified unchanged before
hover; Stern's fit can expand to cover its adjoining plaza. Its existing view
angle and rotunda anchor remain unchanged.

M21 evidence/m21-map-input/ records automatic startup, keyboard/typing and actual
plaza click/lift checks. building-views/ records all8desktop/portrait directions,
input returns and the two pullbacks: at1440×1000 Bobst264.466m and Silver206.738m,
versus220.388m and172.282m previously. Repeated focus does not compound scaling.
