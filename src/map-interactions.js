/** Pointer selection and one captured wheel path; native pinch remains available. */
export function createMapInteractions({ element, controls, hit, select, setHovered, navigation, getRoot, now = () => performance.now() }) {
  let press = null, pointer = null, dragging = false, dirty = false, elapsed = 0;
  let wheelAt = -Infinity, wheelOpen = false;
  let gestureFocus = null, gestureReturning = false, wheelHitPoint = null;
  const hover = event => { const id = hit(event); setHovered(id);dirty=false;elapsed=0;return id; };
  const down = event => {
    // A secondary contact begins native multi-touch navigation, not a landmark
    // click. Discard the pre-focus return pose before pan/pinch can move away.
    navigation.cancel({preserveOverview:event.isPrimary!==false});
    wheelOpen=false;gestureFocus=null;gestureReturning=false;
    pointer = { clientX: event.clientX, clientY: event.clientY };
    press = event.isPrimary === false ? null : { ...pointer, button: event.button, moved: false };
    dragging = true;
    setHovered(null);
  };
  const move = event => {
    pointer = { clientX: event.clientX, clientY: event.clientY };
    if (press && !press.moved && Math.hypot(event.clientX-press.clientX,event.clientY-press.clientY) >= 5) {press.moved=true;navigation.cancel();}
    if (event.buttons || dragging) return;
    dirty=true;
  };
  const up = event => {
    dragging = false;
    if (press?.button === 0 && !press.moved && Math.hypot(event.clientX-press.clientX,event.clientY-press.clientY) < 5) {
      const id = hover(event);
      select(id);
      if (id) navigation.focus(getRoot(id),id);
    }
    press = null;
    dirty = true;
  };
  const leave = () => { pointer = null; press = null; dragging = false; setHovered(null); };
  const wheel = event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const direction = Math.sign(event.deltaY);
    if (!direction) return;
    const time = now(), fresh = !wheelOpen || time-wheelAt > 180;
    if (fresh) { if(wheelOpen)navigation.endZoomGesture();gestureFocus = null;gestureReturning=false;wheelHitPoint=null; }
    wheelAt = time; wheelOpen = true;
    if(direction>0&&(gestureReturning||navigation.returning)) {gestureReturning=true;return;}
    pointer = { clientX: event.clientX, clientY: event.clientY };
    dirty=true;
    // Only eligible inward focus needs an immediate pick. Blank-space inward
    // bursts reuse that decision until the pointer moves meaningfully or a new
    // gesture starts; camera motion must not repeatedly select a moving hit.
    let id=null;
    if(direction<0&&!gestureFocus&&(!wheelHitPoint||Math.hypot(pointer.clientX-wheelHitPoint.clientX,pointer.clientY-wheelHitPoint.clientY)>=5)) {
      id=hover(event);wheelHitPoint={...pointer};
    }
    if (direction < 0 && id && navigation.focusedId !== id && !gestureFocus) {
      select(id);
      navigation.focus(getRoot(id),id);
      gestureFocus = id;
      return;
    }
    if (direction < 0 && navigation.focusedId) gestureFocus = navigation.focusedId;
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight || 800 : 1);
    navigation.zoomDelta(pixels);
    if(navigation.returning)gestureReturning=true;
  };
  const start = () => { navigation.cancel({preserveOverview:true});wheelOpen=false;gestureFocus=null;gestureReturning=false;setHovered(null); };
  const end = () => navigation.reconcile();
  const change = () => { dirty = true; };
  const handlers = { pointerdown: down, pointermove: move, pointerup: up, pointerleave: leave, pointercancel: leave };
  for (const [event,handler] of Object.entries(handlers)) element.addEventListener(event,handler);
  element.addEventListener('wheel',wheel,{capture:true,passive:false});
  controls.addEventListener('start',start);
  controls.addEventListener('end',end);
  controls.addEventListener('change',change);
  return {
    update(deltaSeconds) {
      if(wheelOpen && now()-wheelAt>=180) { navigation.endZoomGesture();wheelOpen=false;gestureFocus=null; }
      if(Number.isFinite(deltaSeconds)&&deltaSeconds>0)elapsed+=deltaSeconds;
      // Re-evaluate stationary pointers during camera travel, without a raycast every frame.
      if (dirty && pointer && !dragging && elapsed >= .08) { hover(pointer); dirty = false; elapsed = 0; }
    },
    dispose() {
      for (const [event,handler] of Object.entries(handlers)) element.removeEventListener(event,handler);
      element.removeEventListener('wheel',wheel,true);
      controls.removeEventListener('start',start); controls.removeEventListener('end',end); controls.removeEventListener('change',change);
    },
  };
}
