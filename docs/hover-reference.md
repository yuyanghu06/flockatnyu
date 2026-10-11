# Landmark surface glow and lift

## Authoritative source inspected

The user supplied `https://github.com/yuyanghu06/yuyang-site.git` after the local
reference lookup failed. Connected GitHub read-only tools successfully retrieved
source at commit **964408fb988786be80005dc8e59e81bc19f657d3**. This supersedes
the provisional radial-halo approximation and its two-active-building limit.
No reference repository files were changed or cloned.

Files actually read:

- [AGENTS.md](https://github.com/yuyanghu06/yuyang-site/blob/964408fb988786be80005dc8e59e81bc19f657d3/AGENTS.md):
  available and read. Its relevant geometry-integrity instruction requires
  complete base-plus-detail landmarks for interaction, bounds and movement.
  The repository tree exposed no additional nested AGENTS.md for these modules.
- [src/components/map/manhattan/navigation.ts](https://github.com/yuyanghu06/yuyang-site/blob/964408fb988786be80005dc8e59e81bc19f657d3/src/components/map/manhattan/navigation.ts):
  `createBuildingGlow` clones landmark surfaces into root-local coordinates and
  uses a shared transparent additive MeshBasicMaterial.
- [src/components/map/animation/landmarks.ts](https://github.com/yuyanghu06/yuyang-site/blob/964408fb988786be80005dc8e59e81bc19f657d3/src/components/map/animation/landmarks.ts):
  lift, opacity and hue animation equations.
- [src/components/map/runtime/map-runtime.tsx](https://github.com/yuyanghu06/yuyang-site/blob/964408fb988786be80005dc8e59e81bc19f657d3/src/components/map/runtime/map-runtime.tsx):
  registration attaches glow to each complete root; frame delta caps at 0.05 s
  and interaction ease is `1-exp(-delta*9)`.
- [src/components/map/shared/rendering.ts](https://github.com/yuyanghu06/yuyang-site/blob/964408fb988786be80005dc8e59e81bc19f657d3/src/components/map/shared/rendering.ts):
  source renderer context, not copied wholesale into the campus renderer.
- [src/components/map/manhattan/neighborhoods/landmarks.ts](https://github.com/yuyanghu06/yuyang-site/blob/964408fb988786be80005dc8e59e81bc19f657d3/src/components/map/manhattan/neighborhoods/landmarks.ts):
  confirms the source merges complete landmark geometry before interaction.

## Reused behavior and parameters

`src/landmark-effects.js` now uses a geometry-matched surface overlay, not a
ground halo or billboard. Material settings match the source: white initial
color, additive blending, DoubleSide, no depth writes, polygon
offset factor/units -1, and render order 4. The default tone-mapping behavior
is retained. Original landmark materials and vertex colors are never modified.

Using elapsed seconds `t` and original root position `baseY`:

```text
ease = 1 - exp(-min(delta, 0.05) * 9)
lift = hovered ? 4.5 : 0
wave = 0.5 + sin(t * 3.4 + baseY * 0.17) * 0.5
hue = 0.56 + sin(t * 0.85 + baseY * 0.11) * 0.095
color = HSL(hue, 0.72, 0.72)
opacityTarget = hovered ? style.baseOpacity + wave * style.waveAmplitude : 0
```

Root Y and hovered opacity interpolate with that ease. The user's later request
overrides the reference's idle glow and selected suppression: new overlays start
hidden at zero opacity, and leaving hover hides them immediately. A hovered
selected landmark now both glows and lifts (the latest request removes the
reference's selected exception). A different hovered landmark can glow
and lift while another is selected. Original building materials stay unchanged.

## Adaptation boundaries

The M12 memory pass supersedes the eager copied/merged overlays. Registration
stores only each complete root and baseline position. On hover, **one active
decoration group** creates lightweight mesh views sharing the original geometry
objects directly. No position, index, normal, UV or color buffers are copied.
Instanced views also share the source instanceMatrix rather than duplicating it.
Leaving or switching hover removes those views immediately, retaining no idle
overlay geometry. Smooth return of the previous building continues independently.

This trades the previous one merged draw for one draw per visible source mesh
of the hovered landmark (eight for Paulson). There are zero overlay draws when
idle. No first-hover geometry cloning, deindexing, merging or bounds rebuilding
is needed; switching allocates only the lightweight scene objects. Views disable
frustum culling to avoid first-hover instance bounds computation; only the active
hovered building is affected. Unlike the reference, instanced details
are included so the entire current landmark receives the effect. No outline,
label, postprocessing, camera transfer or camera lock is added.

Decoration groups remain separate identity scene roots. Each surface view is
transformed with `inverse(scene.matrixWorld) * sourceMesh.matrixWorld`. This follows root
rotation, translation and nonuniform scale while keeping decoration geometry
out of landmark selection bounds and architecture counts. Each decoration
group and child has `userData.mapDecoration=true` and a no-op raycast method.

The source's shadow invalidation is not in this module because this API owns
neither renderer nor shadow policy. If the caller enables cached shadows later,
it must invalidate them during lift. Material blending remains subject to the
campus scene's lighting, atmosphere, renderer and camera, so parameter reuse
does not claim identical final pixels to the original website.

Reduced motion is an intentional accessibility extension: disable lift and
time-varying pulse/hue; use hue 0.56, wave 0.5 and immediate state updates.
Tiny residual lift (<0.001 m) snaps to its endpoint; nonhovered opacity is zero
and its decoration is hidden immediately. The source leaves these values
asymptotic. The provisional color argument is no longer used; HSL follows source.

Central `landmarkGlowStyles` preserves Bobst's base opacity 0.18 and wave amplitude
0.12 (range 0.18–0.30). Other landmarks use 0.14 and 0.08 (range 0.14–0.22),
reducing average opacity from 0.24 to 0.18, or 25%, as requested. Hue and pulse
timing are unchanged. This is an explicit brightness adjustment, not a claim
that duplicate effects caused the previous appearance. Every source surface is
preserved; no facet deduplication, simplification or architectural deletion occurs.

## Integration and verification

The API remains `createLandmarkEffects({scene,reducedMotion})` returning
`register(id,root)`, `setActive(hovered,selected)`, `update(deltaSeconds,timeSeconds)`
and `dispose()`. Register after complete building assembly and placement. The
caller must stop its old material-emission repaint routine. A boolean or callback
may supply reduced motion. Disposal restores baseline positions and releases
only the one effect-owned material, without touching architecture resources.
In particular, neither source geometry nor shared instance buffers are disposed
through a temporary view; doing so could evict buffers still used by the building.
Disposal is idempotent. Per-frame transform matrices are reused.

Syntax and targeted Node/Three geometry/lifecycle checks accompany this pass;
independent integration checks are recorded by the tester. No browser or server
was launched by this coder. Browser comparison with the source website has not
been performed.

Baseline measurement supplied by the independent tester: eleven eager overlays
held **12,224,628 bytes**, representing 339,573 copied triangles, within
69,737,778 total distinct geometry-buffer bytes. The replacement adds zero
distinct geometry/instance buffers and allocates no overlay objects at idle.
Source buffers are not reduced; memory savings come only from removing copies.

A local Node check on the actual eight-mesh Paulson model (3,775,680 source
attribute/index bytes) measured registration at approximately 0.032 ms and first
hover view creation at 1.384 ms in one run. It confirmed shared geometry identity,
selected hover lift of 4.5 m, zero idle decorations and zero source disposal events
through leave and repeated disposal. These are construction measurements, not FPS
or GPU benchmarks; full-scene independent measurements remain the acceptance basis.
