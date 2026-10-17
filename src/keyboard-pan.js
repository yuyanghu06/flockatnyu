import { Vector3 } from 'three';

/** Ground-plane, camera-relative WASD. Moves camera and target together. */
export function createKeyboardPan({ camera, controls, navigation, constrainPan, limits,
  eventTarget = window, documentTarget = document, element = controls.domElement }) {
  const pressed = new Set(), movement = new Vector3();
  const accelerationRate = 14, brakingRate = 24, releaseDuration = .25;
  let velocityX = 0, velocityZ = 0, releaseElapsed = 0;
  const codes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
  const typing = element => element?.isContentEditable || Boolean(element?.closest?.('input,textarea,select,[role="textbox"]'));
  const enabled = () => controls.enabled && !documentTarget.hidden
    && !typing(documentTarget.activeElement) && !documentTarget.querySelector('dialog[open]');
  const reset = () => {
    pressed.clear();
    velocityX = velocityZ = releaseElapsed = 0;
  };
  function down(event) {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return reset();
    if (!codes.has(event.code)) return;
    if (typing(event.target) || !enabled()) return reset();
    // A held key must not restart travel after a pointer or safety handoff.
    if (event.repeat && !pressed.has(event.code)) return;
    event.preventDefault();
    if (!pressed.size || navigation.active) navigation.cancel();
    pressed.add(event.code);
  }
  const up = event => pressed.delete(event.code);
  eventTarget.addEventListener('keydown', down);
  eventTarget.addEventListener('keyup', up, true);
  eventTarget.addEventListener('blur', reset);
  // Window capture also covers focused outward wheel returns over UI panels.
  eventTarget.addEventListener('wheel', reset, true);
  element?.addEventListener('pointerdown', reset, true);
  controls.addEventListener?.('start', reset);
  documentTarget.addEventListener('focusin', reset);
  documentTarget.addEventListener('visibilitychange', reset);
  return {
    reset,
    update(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return false;
      if (!enabled() || navigation.active) { reset(); return false; }
      const forward = Number(pressed.has('KeyW')) - Number(pressed.has('KeyS'));
      const right = Number(pressed.has('KeyD')) - Number(pressed.has('KeyA'));
      let goalX = 0, goalZ = 0, dt = Math.min(deltaSeconds, .1);
      const travelling = Boolean(forward || right);
      if (travelling) {
        let fx = controls.target.x - camera.position.x, fz = controls.target.z - camera.position.z;
        const horizontal = Math.hypot(fx, fz);
        if (horizontal < 1e-8) { reset(); return false; }
        fx /= horizontal; fz /= horizontal;
        movement.set(fx * forward - fz * right, 0, fz * forward + fx * right).normalize();
        const speed = Math.max(24, Math.min(192, camera.position.distanceTo(controls.target) * .8));
        goalX = movement.x * speed; goalZ = movement.z * speed;
        releaseElapsed = 0;
      } else {
        if (!velocityX && !velocityZ) return false;
        // Finish the short release tail exactly, even when a frame crosses it.
        dt = Math.min(dt, releaseDuration - releaseElapsed);
        releaseElapsed = Math.min(releaseDuration, releaseElapsed + deltaSeconds);
      }
      const rate = travelling ? accelerationRate : brakingRate;
      const blend = -Math.expm1(-rate * dt), integral = blend / rate;
      // Integrate the exact velocity curve, rather than stepping with its endpoint.
      movement.set(goalX * dt + (velocityX - goalX) * integral, 0,
        goalZ * dt + (velocityZ - goalZ) * integral);
      velocityX += (goalX - velocityX) * blend;
      velocityZ += (goalZ - velocityZ) * blend;
      if (!travelling && releaseElapsed >= releaseDuration) velocityX = velocityZ = 0;
      camera.position.add(movement);
      controls.target.add(movement);
      const attemptedX = controls.target.x, attemptedZ = controls.target.z;
      constrainPan(camera.position, controls.target, limits);
      // Discard pressure into a boundary while keeping motion along its free axis.
      if (Math.abs(controls.target.x - attemptedX) > 1e-8) velocityX = 0;
      if (Math.abs(controls.target.z - attemptedZ) > 1e-8) velocityZ = 0;
      controls.update();
      return true;
    },
    dispose() {
      reset();
      eventTarget.removeEventListener('keydown', down);
      eventTarget.removeEventListener('keyup', up, true);
      eventTarget.removeEventListener('blur', reset);
      eventTarget.removeEventListener('wheel', reset, true);
      element?.removeEventListener('pointerdown', reset, true);
      controls.removeEventListener?.('start', reset);
      documentTarget.removeEventListener('focusin', reset);
      documentTarget.removeEventListener('visibilitychange', reset);
    },
  };
}
