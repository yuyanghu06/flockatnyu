import { createLoadingState } from './loading-state.js';

const screen = document.getElementById('loading-screen');
const app = document.getElementById('app');
const status = document.getElementById('loading-status');
const enter = document.getElementById('loading-enter');
const retry = document.getElementById('loading-retry');
const error = document.getElementById('loading-error');
let watchdog, previousStatus;
function render(state) {
  clearTimeout(watchdog);
  screen.dataset.state = state.status;
  if (state.status === 'failed') {
    screen.hidden = false;
    app.inert = true;
    app.setAttribute('aria-hidden', 'true');
    document.body.classList.add('loading-map');
    document.dispatchEvent(new Event('campus-loading-failed'));
  }
  screen.setAttribute('aria-busy', String(state.status === 'loading'));
  enter.hidden = state.status !== 'ready';
  enter.disabled = state.status !== 'ready';
  retry.hidden = state.status !== 'failed';
  error.hidden = state.status !== 'failed';
  status.textContent = state.status === 'ready' ? 'Ready.' : state.status === 'failed' ? 'Unable to load the campus.' : 'Loading…';
  error.textContent = state.errors.slice(0, 3).join(' ');
  if (state.errors.length > 3) error.textContent += ` Plus ${state.errors.length - 3} other loading errors.`;
  if (state.status !== previousStatus && (state.status === 'ready' || state.status === 'failed')) {
    (state.status === 'ready' ? enter : retry).focus({ preventScroll: true });
  }
  previousStatus = state.status;
  // A stalled fetch/import/compiler gets a recoverable error, never fake readiness.
  if (state.status === 'loading') watchdog = setTimeout(() => loadingScreen.fail('Loading stalled. Check your connection and choose Retry loading.'), 120000);
}
export const loadingScreen = createLoadingState({
  onChange: render,
  onEnter() {
    clearTimeout(watchdog);
    screen.hidden = true;
    app.inert = false;
    app.removeAttribute('aria-hidden');
    document.body.classList.remove('loading-map');
    document.dispatchEvent(new Event('campus-enter'));
  },
});
enter.addEventListener('click', () => loadingScreen.enter());
retry.addEventListener('click', () => window.location.reload());
render(loadingScreen.snapshot());
status.focus({ preventScroll: true });
