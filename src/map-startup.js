import { createLoadingState } from './loading-state.js';

const app = document.getElementById('app');
const notice = document.getElementById('startup-notice');
const status = document.getElementById('startup-status');
const retry = document.getElementById('startup-retry');
let watchdog, previousStatus;
function render(state) {
  clearTimeout(watchdog);
  app.dataset.state = state.status;
  app.setAttribute('aria-busy', String(state.status === 'loading'));
  notice.hidden = state.status === 'entered';
  retry.hidden = state.status !== 'failed';
  status.textContent = state.status === 'failed'
    ? 'Unable to load the campus. ' + state.errors.slice(0, 3).join(' ')
    : 'Preparing campus…';
  if (state.status === 'failed') {
    app.inert = true;
    document.dispatchEvent(new Event('campus-loading-failed'));
    if (previousStatus !== 'failed') retry.focus({ preventScroll: true });
  }
  previousStatus = state.status;
  if (state.status === 'loading') watchdog = setTimeout(() => campusStartup.fail('Loading stalled. Check your connection and retry.'), 120000);
  if (state.status === 'ready') campusStartup.enter();
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
