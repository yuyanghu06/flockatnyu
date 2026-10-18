export const STARTUP_REVEAL = Object.freeze({ logoMilliseconds: 1100, backdropMilliseconds: 1000 });

/** Decorative playback and cancellable reveal; neither can declare map readiness. */
export function createStartupVisual({ notice, brand, onReveal }) {
  notice.style.setProperty('--startup-logo-duration', `${STARTUP_REVEAL.logoMilliseconds}ms`);
  notice.style.setProperty('--startup-backdrop-duration', `${STARTUP_REVEAL.backdropMilliseconds}ms`);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let mode, generation = 0, timer, transitionTarget, transitionListener;
  function cancelTransition() {
    generation++;
    clearTimeout(timer);
    if (transitionTarget) transitionTarget.removeEventListener('transitionend', transitionListener);
    transitionTarget = transitionListener = null;
    notice.dataset.phase = 'loading';
  }
  function pause() {
    brand.dataset.static = 'true';
  }
  function play() {
    brand.dataset.static = String(motion.matches || brand.dataset.assetsFailed === 'true');
  }
  function waitForTransition(target, property, duration, token, complete) {
    let finished = false;
    function done(event) {
      if (event && (event.target !== target || event.propertyName !== property)) return;
      if (finished || token !== generation || mode !== 'exiting') return;
      finished = true;
      clearTimeout(timer);
      target.removeEventListener('transitionend', done);
      transitionTarget = transitionListener = null;
      complete();
    }
    transitionTarget = target;
    transitionListener = done;
    target.addEventListener('transitionend', done);
    timer = setTimeout(done, duration + 80);
  }
  function finish() {
    cancelTransition();
    mode = 'revealed';
    pause();
    onReveal();
  }
  motion.addEventListener('change', () => {
    if (motion.matches) {
      pause();
      if (mode === 'exiting') finish();
    } else if (mode === 'loading' || mode === 'exiting') play();
  });
  return {
    loading() {
      if (mode === 'loading') return;
      cancelTransition();
      mode = 'loading';
      play();
    },
    reveal() {
      if (mode === 'exiting' || mode === 'revealed') return;
      cancelTransition();
      mode = 'exiting';
      if (motion.matches) { finish(); return; }
      const token = generation;
      // Commit the opaque loading state before beginning compositor transitions.
      void brand.offsetWidth;
      notice.dataset.phase = 'logo-exit';
      waitForTransition(brand, 'transform', STARTUP_REVEAL.logoMilliseconds, token, () => {
        notice.dataset.phase = 'backdrop-exit';
        waitForTransition(notice, 'opacity', STARTUP_REVEAL.backdropMilliseconds, token, finish);
      });
    },
    stop() {
      cancelTransition();
      mode = 'stopped';
      pause();
    },
  };
}

/** Decode static masks before heavy imports; failures keep the static mark usable. */
async function prepareMasks() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const brand = document.getElementById('startup-brand');
  const masks = ['startup-mask-outer', 'startup-mask-inner'].map(id => document.getElementById(id));
  let timer;
  const decoded = Promise.all(masks.map(image => Promise.resolve().then(() => image?.decode?.()))).catch(() => {
    brand.dataset.assetsFailed = 'true';
    brand.dataset.static = 'true';
  });
  await Promise.race([decoded, new Promise(resolve => { timer = setTimeout(resolve, 500); })]);
  clearTimeout(timer);
}

/** Give static masked compositor surfaces a paint opportunity before map work. */
export async function paintStartup() {
  await prepareMasks();
  return new Promise(resolve => {
    let firstFrame, secondFrame;
    const timer = setTimeout(done, 150);
    function done() {
      clearTimeout(timer);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      resolve();
    }
    firstFrame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(done); });
  });
}
