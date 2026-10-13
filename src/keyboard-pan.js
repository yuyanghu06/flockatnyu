import { Vector3 } from 'three';

/** Ground-plane, camera-relative WASD. Moves camera and target together. */
export function createKeyboardPan({ camera, controls, navigation, constrainPan, limits,
  eventTarget = window, documentTarget = document }) {
  const pressed = new Set(), movement = new Vector3();
  const codes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
  const typing = element => element?.isContentEditable || Boolean(element?.closest?.('input,textarea,select,[role="textbox"]'));
  const enabled = () => controls.enabled && !documentTarget.hidden
    && !typing(documentTarget.activeElement) && !documentTarget.querySelector('dialog[open]');
  const clear = () => pressed.clear();
  function down(event) {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return clear();
    if (!codes.has(event.code) || typing(event.target) || !enabled()) return;
    event.preventDefault();
    if (!pressed.size) navigation.cancel();
    pressed.add(event.code);
  }
  const up = event => pressed.delete(event.code);
  eventTarget.addEventListener('keydown', down);
  eventTarget.addEventListener('keyup', up, true);
  eventTarget.addEventListener('blur', clear);
  documentTarget.addEventListener('focusin', clear);
  documentTarget.addEventListener('visibilitychange', clear);
  return {
    update(deltaSeconds) {
      if (!enabled()) { clear(); return false; }
      if (!pressed.size || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return false;
      const forward = Number(pressed.has('KeyW')) - Number(pressed.has('KeyS'));
      const right = Number(pressed.has('KeyD')) - Number(pressed.has('KeyA'));
      if (!forward && !right) return false;
      let fx = controls.target.x - camera.position.x, fz = controls.target.z - camera.position.z;
      const horizontal = Math.hypot(fx, fz);
      if (horizontal < 1e-8) return false;
      fx /= horizontal; fz /= horizontal;
      movement.set(fx * forward - fz * right, 0, fz * forward + fx * right).normalize();
      const speed = Math.max(15, Math.min(120, camera.position.distanceTo(controls.target) * .5));
      movement.multiplyScalar(speed * Math.min(deltaSeconds, .1));
      camera.position.add(movement);
      controls.target.add(movement);
      constrainPan(camera.position, controls.target, limits);
      controls.update();
      return true;
    },
    dispose() {
      clear();
      eventTarget.removeEventListener('keydown', down);
      eventTarget.removeEventListener('keyup', up, true);
      eventTarget.removeEventListener('blur', clear);
      documentTarget.removeEventListener('focusin', clear);
      documentTarget.removeEventListener('visibilitychange', clear);
    },
  };
}
