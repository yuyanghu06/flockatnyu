# M5: Courant and Stern window detailing

User explicitly reauthorized this pass after M4, limited to Leslie/Silver-style
window details and subtle finishing touches. Preserve Courant and Stern's exact
existing color schemes. Source GLBs and shell geometry remain unchanged; enhance
existing window patches with merged frame, mullion and sill geometry under the
same selectable root. No Bobst work and no new palette application.

Coder owns enhancement module and detail notes, tester owns before/after browser
captures and tests, root owns integration/journal. Acceptance requires unchanged
source geometry/color buffers, same-pose visible improvement without duplicate
glass or z-fighting, complete selection, and bounded rendering cost.

Status: accepted after8/8checks and independent visual review. Originalbuffers/materials unchanged; exactsourcepalette reused. Two merged meshes perbuilding. Render sample~165FPS, startup~2.34s; mobilehardware unverified.
