import {
  parsePresence,
  parseUpcoming,
  markerSignature,
  contentSignature,
} from './map-presence-helpers.js';

export function installMapPresenceRefresh(view) {
  view.refresh = function refresh() {
    if (view.disposed) return Promise.resolve();
    if (view.pending) return view.pending;
    clearTimeout(view.retryTimer);
    view.retryTimer = null;
    view.refreshQueued = false;
    const controller = new AbortController();
    view.requestController = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    let retryable = true;
    view.pending = (async () => {
      try {
        const response = await view.fetchImpl('/api/map/presence', {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!response.ok) {
          retryable = response.status >= 500 || [408, 429].includes(response.status);
          throw new Error('Map presence unavailable');
        }
        const payload = await response.json();
        const next = parsePresence(payload);
        const nextUpcoming = payload.upcoming === undefined ? [] : parseUpcoming(payload.upcoming);
        if (view.disposed) return;
        const nextSource = next.filter((building) => building.people.length);
        const nextMarkerKey = markerSignature(nextSource);
        const nextContentKey = contentSignature(next, nextUpcoming);
        const markersChanged = view.markerKey !== nextMarkerKey;
        const contentChanged =
          view.contentKey !== nextContentKey ||
          view.status !== 'ok' ||
          view.upcomingAvailable !== Array.isArray(payload.upcoming);
        view.catalogue = next;
        view.onCatalogueChange(view.catalogue);
        view.source = nextSource;
        view.nextMarkerExpiry = view.source.reduce(
          (end, building) =>
            building.people.reduce((end, person) => Math.min(end, person.ends), end),
          Infinity,
        );
        view.upcoming = nextUpcoming;
        view.upcomingAvailable = Array.isArray(payload.upcoming);
        view.observedAt = typeof payload.observedAt === 'string' ? payload.observedAt : null;
        view.status = 'ok';
        view.retryAttempt = 0;
        retryable = false;
        view.markerKey = nextMarkerKey;
        view.contentKey = nextContentKey;
        if (contentChanged) view.invalidateContent();
        if (markersChanged) view.rebuild();
        else view.update();
      } catch {
        if (!view.disposed) {
          view.catalogue = [];
          view.source = [];
          view.upcoming = [];
          view.upcomingAvailable = false;
          view.onCatalogueChange(view.catalogue);
          view.status = 'unavailable';
          view.observedAt = null;
          view.markerKey = view.contentKey = '';
          view.nextMarkerExpiry = Infinity;
          view.invalidateContent();
          view.rebuild();
        }
      } finally {
        clearTimeout(timeout);
        view.pending = null;
        view.requestController = null;
        if (!view.disposed && document.visibilityState !== 'hidden') {
          // Coalesce writes during a poll into one read begun after those saves.
          if (view.refreshQueued) void view.refresh();
          else if (retryable && view.retryAttempt < 2) {
            const delay = [1000, 3000][view.retryAttempt++];
            view.retryTimer = setTimeout(view.refreshVisible, delay);
          }
        }
      }
    })();
    return view.pending;
  };
}
