import * as THREE from 'three';
import { buildingViews, buildingFocusPolarAngle, buildingFocusedMaxPolarAngle } from './building-views.js';

/** Caller routes captured wheel deltas here; native pinch may remain enabled.
 * Negative direction/'in' zooms inward; positive/'out' outward. Manual gestures
 * call cancel(); gesture end calls reconcile() for pinch-out overview return.
 * Reset/restore call clearFocus(). update runs after controls.update.
 * Original damping is drained and held off while a transition is active. */
export function createCameraFocus({ camera, controls, limits, constrainPan, reducedMotion = false }) {
  let transition = null, focusedId = null, focusedRange = false, zoomGesture = null, overviewSnapshot = null;
  const overviewMaxPolar = limits.maxPolarAngle ?? controls.maxPolarAngle ?? Math.PI;
  const focusedMaxPolar = Math.max(overviewMaxPolar, buildingFocusedMaxPolarAngle);
  const clampDistance = n => THREE.MathUtils.clamp(n, limits.minDistance, limits.maxDistance);
  const clampPolar = n => THREE.MathUtils.clamp(n, limits.minPolarAngle ?? controls.minPolarAngle ?? 0, focusedRange ? focusedMaxPolar : overviewMaxPolar);
  const levels = [...new Set([limits.minDistance, 30, 50, 80, 120, 180, 260, 350, limits.maxDistance].map(clampDistance))].sort((a,b)=>a-b);
  function stopTransition() {
    if (transition) controls.enableDamping = transition.damping;
    transition = null; zoomGesture = null;
  }
  // Public cancellation represents manual navigation; an old overview pose
  // should no longer pull the user back after they deliberately orbit or pan.
  function cancel({ preserveOverview = false } = {}) { stopTransition();if(!preserveOverview)overviewSnapshot=null; }
  function clearFocus() {
    cancel(); focusedId = null; focusedRange = false;
    controls.maxPolarAngle = overviewMaxPolar;
  }
  function current() {
    const target = controls.target.clone();
    const sphere = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
    sphere.radius = clampDistance(sphere.radius); sphere.phi = clampPolar(sphere.phi);
    return { target, sphere };
  }
  function begin(target, distance, theta, phi, rate, exitFocus = false) {
    if (!transition) {
      const damping = controls.enableDamping;
      const savedPosition = camera.position.clone(), savedTarget = controls.target.clone();
      controls.enableDamping = false; controls.update();
      // Drain OrbitControls' pending deltas without applying them to the visible
      // starting pose. Subsequent updates have no residual input to replay.
      camera.position.copy(savedPosition); controls.target.copy(savedTarget);
      camera.lookAt(controls.target); controls.update();
      const start = current();
      transition = { values: [...start.target.toArray(), start.sphere.theta, start.sphere.phi, Math.log(start.sphere.radius)], velocity: [0,0,0,0,0,0], damping };
    }
    const state = transition;
    // Shortest azimuth arc avoids a complete spin across the +/-pi seam.
    const delta = Math.atan2(Math.sin(theta-state.values[3]), Math.cos(theta-state.values[3]));
    const endSphere = new THREE.Spherical(clampDistance(distance), clampPolar(phi), state.values[3]+delta);
    const endTarget = target.clone(), endPosition = new THREE.Vector3().setFromSpherical(endSphere).add(endTarget);
    constrainPan(endPosition, endTarget, limits);
    Object.assign(state, { endTarget, endSphere, rate, exitFocus, returning:false,
      goal: [...endTarget.toArray(),endSphere.theta,endSphere.phi,Math.log(endSphere.radius)] });
    return true;
  }
  function focus(root, id = root?.userData?.buildingId) {
    if (!root?.isObject3D) return false;
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty() || ![...box.min.toArray(),...box.max.toArray()].every(Number.isFinite)) return false;
    box.min.y -= 4.5; box.max.y += 4.5;
    const view = buildingViews[id];
    const target = view?.target ? new THREE.Vector3().fromArray(view.target) : box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length()/2;
    const vertical = THREE.MathUtils.degToRad(camera.getEffectiveFOV ? camera.getEffectiveFOV() : camera.fov)/2;
    const halfFov = Math.min(vertical, Math.atan(Math.tan(vertical)*camera.aspect));
    if (!Number.isFinite(halfFov) || halfFov<=0 || halfFov>=Math.PI/2) return false;
    const distance = radius/Math.sin(halfFov)*1.12*(view?.distanceScale ?? 1);
    if (!Number.isFinite(distance)) return false;
    const front = view?.front;
    const theta = front ? Math.atan2(front[0],front[1]) : current().sphere.theta;
    const originalPolar = view?.polarAngle ?? buildingFocusPolarAngle;
    const verticalOffset = Math.cos(originalPolar) * (view?.heightScale ?? 1);
    const horizontalOffset = Math.sin(originalPolar);
    const phi = Math.atan2(horizontalOffset, verticalOffset);
    zoomGesture = null;
    if(!overviewSnapshot) {
      overviewSnapshot=current();
      overviewSnapshot.sphere.phi=Math.min(overviewSnapshot.sphere.phi,overviewMaxPolar);
    }
    focusedRange = true; controls.maxPolarAngle = focusedMaxPolar;
    // Per-building pullback scales the original fit; profile lowering sets only
    // the viewing angle, so selecting a new view does not also zoom inward.
    begin(target,distance,theta,phi,10);
    focusedId = id ?? null;
    return true;
  }
  function zoom(direction, { fine = focusedId !== null } = {}) {
    const inward = direction === 'in' || (typeof direction === 'number' && direction < 0);
    if (!inward && direction !== 'out' && !(typeof direction === 'number' && direction > 0)) return false;
    if(!inward&&focusedRange)return returnToOverview();
    // Accumulate bursts from the pending destination, never the partly eased
    // camera position. Preserve an unfinished focus target and front direction.
    const state = current(), pending = transition?.endSphere ?? state.sphere;
    const target = transition?.endTarget ?? state.target, distance = pending.radius;
    const end = fine ? clampDistance(distance*(inward?1/1.1:1.1))
      : inward ? ([...levels].reverse().find(n=>n<distance-.001) ?? levels[0])
        : (levels.find(n=>n>distance+.001) ?? levels.at(-1));
    if (Math.abs(end-distance)<1e-8 && !focusedRange) return false;
    return applyZoomGoal(target,end,pending,fine);
  }
  function applyZoomGoal(target,end,pending,fine) {
    return begin(target,end,pending.theta,pending.phi,fine?9:12);
  }
  function returnToOverview() {
    if(transition?.returning)return false;
    const snapshot=overviewSnapshot??current();
    const phi=Math.min(snapshot.sphere.phi,overviewMaxPolar);
    zoomGesture=null;
    begin(snapshot.target,snapshot.sphere.radius,snapshot.sphere.theta,phi,10,true);
    transition.returning=true;
    return true;
  }
  /** Normalized signed CSS pixels, without input throttling or discarded tails.
   * During a gesture the destination is continuous in log distance; ordinary
   * navigation settles onto the nearest fixed level when the gesture ends. */
  function zoomDelta(pixels) {
    if(!Number.isFinite(pixels)||pixels===0)return false;
    if(pixels>0&&focusedRange)return returnToOverview();
    const state=current(),pending=transition?.endSphere??state.sphere;
    const target=transition?.endTarget??state.target;
    zoomGesture ??= { fine:focusedId!==null };
    const gain=zoomGesture.fine?.0008:.002;
    const log=THREE.MathUtils.clamp(Math.log(pending.radius)+pixels*gain,Math.log(limits.minDistance),Math.log(limits.maxDistance));
    return applyZoomGoal(target,Math.exp(log),pending,zoomGesture.fine);
  }
  function endZoomGesture() {
    if(!zoomGesture)return false;
    const fine=zoomGesture.fine;zoomGesture=null;
    if(fine)return true;
    const state=current(),pending=transition?.endSphere??state.sphere;
    const target=transition?.endTarget??state.target;
    const nearest=levels.reduce((best,n)=>Math.abs(Math.log(n/pending.radius))<Math.abs(Math.log(best/pending.radius))?n:best,levels[0]);
    return applyZoomGoal(target,nearest,pending,false);
  }
  // Native pinch has already moved the camera. Reconcile at gesture end rather
  // than constraining its pitch immediately or fighting an ongoing gesture.
  function reconcile() {
    if (transition || !focusedRange) return false;
    const state = current();
    if (state.sphere.radius < limits.maxDistance*.92) return false;
    return returnToOverview();
  }
  function leaveFocus() {
    if (!focusedRange) return false;
    return returnToOverview();
  }
  function update(deltaSeconds) {
    if (!transition || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return false;
    const state = transition;
    const immediate = typeof reducedMotion === 'function' ? reducedMotion() : reducedMotion;
    const exponent = state.rate*deltaSeconds;
    const decay = Math.exp(-exponent);
    // Bound log-speed to its stopping envelope before the exact step. For a
    // critically damped spring v<=w*(upper-x) prevents crossing the hard cap.
    // This decelerates toward bounds instead of overshooting then hitting a wall.
    state.velocity[5]=THREE.MathUtils.clamp(state.velocity[5],
      -state.rate*(state.values[5]-Math.log(limits.minDistance)),
      state.rate*(Math.log(limits.maxDistance)-state.values[5]));
    // Exact critically damped solution for a fixed goal during this frame.
    // Wheel/refocus retargets replace the goal, never the persistent velocity.
    for(let i=0;i<6;i++) {
      if(immediate || exponent>700) { state.values[i]=state.goal[i];state.velocity[i]=0;continue; }
      const error=state.values[i]-state.goal[i], coefficient=state.velocity[i]+state.rate*error;
      state.values[i]=state.goal[i]+(error+coefficient*deltaSeconds)*decay;
      state.velocity[i]=(state.velocity[i]-state.rate*coefficient*deltaSeconds)*decay;
    }
    for(const [index,clamped] of [[4,clampPolar(state.values[4])],[5,THREE.MathUtils.clamp(state.values[5],Math.log(limits.minDistance),Math.log(limits.maxDistance))]]) {
      if(clamped!==state.values[index]) {state.values[index]=clamped;state.velocity[index]=0;}
    }
    const settled=state.values.every((n,i)=>Math.abs(n-state.goal[i])<(i<3?.001:.00001) && Math.abs(state.velocity[i])<(i<3?.001:.00001)*state.rate);
    if(settled) {state.values=[...state.goal];state.velocity.fill(0);}
    controls.target.fromArray(state.values);
    const sphere = new THREE.Spherical(Math.exp(state.values[5]),state.values[4],state.values[3]);
    camera.position.setFromSpherical(sphere).add(controls.target);
    constrainPan(camera.position,controls.target,limits);
    controls.target.toArray().forEach((n,i)=>{if(Math.abs(n-state.values[i])>1e-10){state.values[i]=n;state.velocity[i]=0;}});
    camera.lookAt(controls.target); controls.update();
    if(settled) {
      const exitFocus = state.exitFocus;
      const gesture=zoomGesture;stopTransition();zoomGesture=gesture;
      if(exitFocus)clearFocus();
    }
    return true;
  }
  return Object.freeze({ focus, zoom, zoomDelta, endZoomGesture, update, cancel, clearFocus, reconcile, leaveFocus,
    get active(){return transition!==null;}, get focusedId(){return focusedId;}, get returning(){return Boolean(transition?.returning);} });
}
