import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Vector3 } from 'three';
import { createKeyboardPan } from '../src/keyboard-pan.js';
import { constrainPan } from '../src/geometry.js';
class Events {
  constructor(parent = null) { this.parent = parent; }
  listeners = new Map();
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { assert(this.listeners.get(name)?.delete(fn)); if (!this.listeners.get(name).size) this.listeners.delete(name); }
  emit(name, detail = {}) { const event = { preventDefault() { this.prevented = true; }, ...detail }; this.parent?.emit(name, event); for (const fn of this.listeners.get(name) || []) fn(event); return event; }
}
function rig({distance, bounds = 10000} = {}) {
  const eventTarget = new Events(), documentTarget = new Events(), element = new Events(eventTarget);
  documentTarget.querySelector = () => documentTarget.modal;
  const camera = { position: new Vector3(0, 50, 100) };
  if (distance) camera.position.set(0, distance * .6, distance * .8);
  const controls = Object.assign(new Events(), { target: new Vector3(), enabled: true, domElement: element, update() {} });
  const navigation = { active: false, cancelled: 0, cancel() { this.active = false; this.cancelled++; } };
  const limits = { minCameraHeight: 1, targetBounds: { minX: -bounds, maxX: bounds, minY: 0, maxY: 1000, minZ: -bounds, maxZ: bounds } };
  const pan = createKeyboardPan({ camera, controls, navigation, limits, constrainPan, eventTarget, documentTarget });
  return { pan, camera, controls, navigation, eventTarget, documentTarget, element };
}
const checks = [], observations = {};
const check = (name, fn) => { fn(); checks.push({ name, pass: true }); };
const near = (a, b, tolerance = 1e-7) => assert(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const key = (r, code, down = true, extra = {}) => r.eventTarget.emit(down ? 'keydown' : 'keyup', { code, ...extra });
const advance = (r, seconds, hz = 60) => { for (let i = 0; i < Math.round(seconds * hz); i++) r.pan.update(1 / hz); };
const step = (r, dt = 1 / 60) => { const before = r.controls.target.clone(); r.pan.update(dt); return r.controls.target.clone().sub(before); };
const unchanged = (r, fn) => { const before = r.camera.position.clone(); fn(); near(r.camera.position.distanceTo(before), 0); };
check('W/S and A/D preserve camera bearing, height and zoom throughout acceleration and braking', () => {
  for (const [code, x, z] of [['KeyW', 0, -1], ['KeyS', 0, 1], ['KeyA', -1, 0], ['KeyD', 1, 0]]) {
    const r = rig(), offset = r.camera.position.clone().sub(r.controls.target);
    assert(key(r, code).prevented); advance(r, .5); key(r, code, false); advance(r, .5);
    assert(Math.sign(r.controls.target.x) === x && Math.sign(r.controls.target.z) === z);
    near(r.camera.position.clone().sub(r.controls.target).distanceTo(offset), 0); near(r.controls.target.y, 0); assert.equal(r.navigation.cancelled, 1);
    r.pan.dispose(); assert.equal(r.eventTarget.listeners.size + r.documentTarget.listeners.size + r.element.listeners.size + r.controls.listeners.size, 0);
  }
  const r = rig(); r.camera.position.set(100, 50, 0); key(r, 'KeyW'); advance(r, .5); assert(r.controls.target.x < 0); near(r.controls.target.z, 0);
});
check('Start gradually accelerates; released motion gradually decelerates and settles within250ms', () => {
  const r = rig(); key(r, 'KeyW'); const start = Array.from({ length: 30 }, () => step(r).length() * 60);
  assert(start[0] > 0 && start[0] < start.at(-1) * .2);
  for (let i = 1; i < start.length; i++) assert(start[i] > start[i - 1]);
  key(r, 'KeyW', false); const release = Array.from({ length: 15 }, () => step(r).length() * 60);
  assert(release[0] > 0 && release[0] < start.at(-1));
  for (let i = 1; i < release.length; i++) assert(release[i] <= release[i - 1] + 1e-8);
  unchanged(r, () => advance(r, 1));
  assert(release.reduce((a, b) => a + b / 60, 0) < start.at(-1) * .06);
  observations.startSpeeds = start; observations.releaseSpeeds = release;
});
check('Equal elapsed hold/release/reversal paths agree at30,60and144Hz', () => {
  const paths = [30, 60, 144].map(hz => { const r = rig(); key(r, 'KeyW'); advance(r, 1, hz); key(r, 'KeyW', false); advance(r, .5, hz); key(r, 'KeyD'); advance(r, 1, hz); key(r, 'KeyD', false); key(r, 'KeyA'); advance(r, 1, hz); key(r, 'KeyA', false); advance(r, .5, hz); return r.controls.target.toArray(); });
  for (const path of paths.slice(1)) path.forEach((n, i) => near(n, paths[0][i], .01)); observations.frameRatePaths = paths;
});
check('Reversal brakes through zero smoothly before moving the opposite direction', () => {
  const r = rig(); key(r, 'KeyD'); advance(r, 1); key(r, 'KeyD', false); key(r, 'KeyA');
  const shifts = Array.from({ length: 30 }, () => step(r).x); assert(shifts[0] > 0 && shifts.at(-1) < 0);
  for (let i = 1; i < shifts.length; i++) assert(shifts[i] < shifts[i - 1]); observations.reversalShifts = shifts;
});
check('Diagonal matches axial travel; opposite keys brake to rest, then released opposite resumes', () => {
  const a = rig(), b = rig(); key(a, 'KeyW'); key(b, 'KeyW'); key(b, 'KeyD'); advance(a, 1); advance(b, 1); near(a.controls.target.length(), b.controls.target.length());
  key(a, 'KeyS'); assert(step(a).length() > 0); advance(a, .5); unchanged(a, () => advance(a, .5)); key(a, 'KeyS', false); assert(step(a).z < 0);
});
check('Steady speed is60percent faster at close, middle and far zoom with24–192bounds', () => {
  observations.cruise = [15, 100, 1000].map(distance => { const r = rig({ distance }); key(r, 'KeyD'); advance(r, 2); const speed = step(r).length() * 60, oldSpeed = Math.max(15, Math.min(120, distance * .5)); near(speed, oldSpeed * 1.6, .0001); return { distance, speed, oldSpeed }; });
});
check('Invalid frame deltas cause no travel; suspended frame travel is capped at100ms', () => {
  const r = rig(); key(r, 'KeyW'); advance(r, .5); for (const dt of [0, -1, NaN, Infinity, undefined]) unchanged(r, () => assert.equal(r.pan.update(dt), false));
  const a = rig(), b = rig(); key(a, 'KeyW'); key(b, 'KeyW'); a.pan.update(100); b.pan.update(.1); near(a.controls.target.distanceTo(b.controls.target), 0);
});
check('Release expires after a suspended frame without another braking tail', () => {
  const r = rig(); key(r, 'KeyW'); advance(r, .5); key(r, 'KeyW', false); r.pan.update(1); unchanged(r, () => advance(r, 1));
});
check('Bounds retain camera offset and remove blocked-axis momentum for immediate reverse acceleration', () => {
  const r = rig({ bounds: 10 }), fresh = rig({ bounds: 10 }), offset = r.camera.position.clone().sub(r.controls.target); key(r, 'KeyD'); advance(r, 2); near(r.controls.target.x, 10); near(r.camera.position.clone().sub(r.controls.target).distanceTo(offset), 0);
  key(r, 'KeyD', false); key(r, 'KeyA'); key(fresh, 'KeyA'); const boundedStep = step(r), freshStep = step(fresh); assert(boundedStep.x < 0); near(boundedStep.x, freshStep.x);
});
check('Typing, dialogs, disabled/loading controls, hidden tabs and modified/composing/prevented keys are untouched', () => {
  for (const condition of ['typing', 'contenteditable', 'modal', 'loading', 'hidden', 'ctrl', 'meta', 'alt', 'composing', 'prevented']) {
    const r = rig(), event = {};
    if (condition === 'typing') event.target = { closest: () => true }; if (condition === 'contenteditable') event.target = { isContentEditable: true };
    if (condition === 'modal') r.documentTarget.modal = true; if (condition === 'loading') r.controls.enabled = false; if (condition === 'hidden') r.documentTarget.hidden = true;
    if (['ctrl', 'meta', 'alt'].includes(condition)) event[condition + 'Key'] = true; if (condition === 'composing') event.isComposing = true; if (condition === 'prevented') event.defaultPrevented = true;
    assert(!key(r, 'KeyW', true, event).prevented); unchanged(r, () => assert.equal(r.pan.update(.1), false));
  }
});
check('Blur, focus transfer, visibility, pointer, canvas/window wheel and controls.start stop inertia immediately', () => {
  for (const [target, event] of [['eventTarget', 'blur'], ['documentTarget', 'focusin'], ['documentTarget', 'visibilitychange'], ['element', 'pointerdown'], ['element', 'wheel'], ['eventTarget', 'wheel'], ['controls', 'start']]) {
    const r = rig(); key(r, 'KeyW'); advance(r, .5); key(r, 'KeyW', false); r[target].emit(event);
    unchanged(r, () => assert.equal(r.pan.update(.1), false));
    key(r, 'KeyW', true, { repeat: true }); unchanged(r, () => r.pan.update(.1)); key(r, 'KeyW', false); key(r, 'KeyW'); assert(step(r).length() > 0);
  }
});
check('Dynamic typing/dialog/disabled/hidden guards stop accumulated velocity and held input immediately', () => {
  for (const condition of ['typing', 'modal', 'disabled', 'hidden']) {
    const r = rig(); key(r, 'KeyW'); advance(r, .5);
    if (condition === 'typing') r.documentTarget.activeElement = { isContentEditable: true }; if (condition === 'modal') r.documentTarget.modal = true; if (condition === 'disabled') r.controls.enabled = false; if (condition === 'hidden') r.documentTarget.hidden = true;
    unchanged(r, () => assert.equal(r.pan.update(.1), false)); r.documentTarget.activeElement = null; r.documentTarget.modal = false; r.documentTarget.hidden = false; r.controls.enabled = true; unchanged(r, () => r.pan.update(.1));
  }
});
check('Scripted navigation and explicit reset immediately clear held travel, including repeated keydown', () => {
  for (const scripted of [true, false]) {
    const r = rig(); key(r, 'KeyW'); advance(r, .5); if (scripted) r.navigation.active = true; else r.pan.reset();
    unchanged(r, () => r.pan.update(.1)); r.navigation.active = false; key(r, 'KeyW', true, { repeat: true }); unchanged(r, () => r.pan.update(.1)); key(r, 'KeyW', false); key(r, 'KeyW'); assert(step(r).length() > 0);
  }
});
check('Disposal clears inertia and every registered listener', () => {
  const r = rig(); key(r, 'KeyW'); advance(r, .5); r.pan.dispose(); assert.equal(r.eventTarget.listeners.size + r.documentTarget.listeners.size + r.element.listeners.size + r.controls.listeners.size, 0); unchanged(r, () => r.pan.update(.1));
});
const evidence = process.env.MAP_EVIDENCE || 'evidence/m23-smooth-wasd'; fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(`${evidence}/keyboard-results.json`, JSON.stringify({ checks, observations }, null, 2) + '\n'); console.log(`${checks.length}/${checks.length} smooth/faster WASD checks passed`);
