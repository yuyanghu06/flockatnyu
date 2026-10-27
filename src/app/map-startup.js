import { createLoadingState } from './loading-state.js';
import { createStartupVisual } from './startup-visual.js';

const app = document.getElementById('app');
const notice = document.getElementById('startup-notice');
const status = document.getElementById('startup-status');
const retry = document.getElementById('startup-retry');
const brand = document.getElementById('startup-brand');
const visual = createStartupVisual({
  notice,
  brand,
  onReveal() {
    if (campusStartup.snapshot().status === 'ready') campusStartup.enter();
  },
});
let watchdog, previousStatus;
function render(state) {
  clearTimeout(watchdog);
  app.dataset.state = state.status;
  notice.dataset.state = state.status;
  app.setAttribute('aria-busy', String(state.status === 'loading'));
  app.inert = state.status !== 'entered';
  notice.hidden = state.status === 'entered';
  brand.hidden = state.status === 'failed';
  retry.hidden = state.status !== 'failed';
  status.textContent =
    state.status === 'failed'
      ? 'Unable to load the campus. ' + state.errors.slice(0, 3).join(' ')
      : 'Preparing campus…';
  if (state.status === 'failed') {
    visual.stop();
    document.dispatchEvent(new Event('campus-loading-failed'));
    if (previousStatus !== 'failed') retry.focus({ preventScroll: true });
  } else if (state.status === 'loading') {
    visual.loading();
    watchdog = setTimeout(
      () => campusStartup.fail('Loading stalled. Check your connection and retry.'),
      120000,
    );
  } else if (state.status === 'ready') {
    visual.reveal();
  } else if (state.status === 'entered') visual.stop();
  previousStatus = state.status;
}
export const campusStartup = createLoadingState({
  onChange: render,
  onEnter() {
    app.inert = false;
    document.dispatchEvent(new Event('campus-enter'));
  },
});
retry.addEventListener('click', () => window.location.reload());
render(campusStartup.snapshot());
