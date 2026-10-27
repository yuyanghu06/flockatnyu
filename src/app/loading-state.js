/** Pure loading gate. Resource counts may begin before job registration.
 * A controller is single-use: failures and entry cannot be reset by start(). */
export function createLoadingState({ onChange = () => {}, onEnter = () => {} } = {}) {
  let started = false,
    totalJobs = 0,
    completedJobs = 0;
  let pendingResources = 0,
    scenePrepared = false,
    entered = false;
  const errors = [];
  function status() {
    if (errors.length) return 'failed';
    if (entered) return 'entered';
    if (
      started &&
      totalJobs > 0 &&
      completedJobs === totalJobs &&
      pendingResources === 0 &&
      scenePrepared
    )
      return 'ready';
    return 'loading';
  }
  function snapshot() {
    return Object.freeze({
      status: status(),
      started,
      totalJobs,
      completedJobs,
      pendingResources,
      scenePrepared,
      entered,
      errors: Object.freeze([...errors]),
    });
  }
  function changed() {
    onChange(snapshot());
  }
  function start(total) {
    if (!Number.isSafeInteger(total) || total <= 0)
      throw new RangeError('Loading job total must be a positive safe integer.');
    if (started || entered || errors.length) return false;
    started = true;
    totalJobs = total;
    changed();
    return true;
  }
  function jobFinished() {
    if (!started || completedJobs >= totalJobs) return false;
    completedJobs++;
    changed();
    return true;
  }
  function resourceStarted() {
    if (pendingResources === Number.MAX_SAFE_INTEGER)
      throw new RangeError('Pending resource count exceeded safe integer range.');
    pendingResources++;
    changed();
    return true;
  }
  function resourceFinished() {
    if (pendingResources === 0) return false;
    pendingResources--;
    changed();
    return true;
  }
  function sceneReady() {
    if (scenePrepared) return false;
    scenePrepared = true;
    changed();
    return true;
  }
  function fail(message) {
    const text = String(message ?? '').trim() || 'Unknown loading error.';
    if (errors.includes(text)) return false;
    errors.push(text);
    changed();
    return true;
  }
  function enter() {
    if (status() !== 'ready' || entered) return false;
    entered = true;
    const state = snapshot();
    onChange(state);
    onEnter(state);
    return true;
  }
  return Object.freeze({
    start,
    jobFinished,
    resourceStarted,
    resourceFinished,
    sceneReady,
    fail,
    enter,
    snapshot,
  });
}
