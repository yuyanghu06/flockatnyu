import '../features/assistant/assistant.css';

import '../features/contacts/contacts.css';

import { cameraLimits } from '../map/data/config.js';

import { constrainPan } from '../map/landmarks/geometry.js';

import './style.css';
export function installMapFrame(view) {
  view.performanceSnapshot = function performanceSnapshot() {
    const count = Math.min(view.frameSamples, view.frameIntervals.length);
    const summarize = (values) => {
      const sorted = Array.from(values.subarray(0, count)).sort((a, b) => a - b);
      const percentile = (p) => sorted[Math.max(0, Math.ceil(count * p) - 1)] ?? null;
      return { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) };
    };
    return {
      samples: count,
      frameIntervalMs: summarize(view.frameIntervals),
      mainThreadFrameMs: summarize(view.frameCpu),
      resources: { ...view.renderer.info.memory },
      programs: view.renderer.info.programs?.length,
      note: 'Rolling 300 frames; CPU timing excludes asynchronous GPU execution. Resource counts are not bytes.',
    };
  };
  view.animate = function animate() {
    const now = performance.now();
    const elapsedSeconds = Math.max(0, (now - view.lastFrame) / 1000);
    const delta = Math.min(elapsedSeconds, 0.1);
    view.landmarkEffects.update(delta, now / 1000);
    view.lastFrame = now;
    view.controls.update();
    view.keyboardPan.update(elapsedSeconds);
    // Deselect on the first return frame; leaveFocus() preserves an already
    // running return, so indicator cleanup does not restart camera movement.
    if (
      view.cameraNavigation.returning &&
      view.cameraNavigation.focusedId &&
      view.state.selected === view.cameraNavigation.focusedId
    )
      view.select(null);
    view.cameraNavigation.update(elapsedSeconds);
    constrainPan(view.camera.position, view.controls.target, cameraLimits);
    view.mapInteractions.update(delta);
    view.eventIndicators.update();
    view.renderer.render(view.scene, view.camera);
    view.landmarkEffects.renderOutline(view.renderer, view.camera);
    view.mapPresence.update();
    const sample = view.frameSamples++ % view.frameIntervals.length;
    view.frameIntervals[sample] = elapsedSeconds * 1000;
    view.frameCpu[sample] = performance.now() - now;
    requestAnimationFrame(view.animate);
  };
}
export function initializeMapFrame(view) {
  view.lastFrame = performance.now();
  view.frameIntervals = new Float32Array(300);
  view.frameCpu = new Float32Array(300);
  view.frameSamples = 0;
}
