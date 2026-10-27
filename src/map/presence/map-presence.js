import './map-presence.css';

import { installMapPresenceContent } from './map-presence-content.js';
import { installMapPresenceMarkers } from './map-presence-markers.js';
import { installMapPresenceFrame } from './map-presence-frame.js';
import { installMapPresenceRefresh } from './map-presence-refresh.js';
import { initializeMapPresence } from './map-presence-elements.js';
export function createMapPresence({
  container,
  camera,
  renderer,
  getRoot,
  selectBuilding,
  focusBuilding,
  getFocusedBuilding = () => null,
  fetchImpl = fetch,
  onCatalogueChange = () => {},
}) {
  const view = {
    container,
    camera,
    renderer,
    getRoot,
    selectBuilding,
    focusBuilding,
    getFocusedBuilding,
    fetchImpl,
    onCatalogueChange,
  };
  installMapPresenceContent(view);
  installMapPresenceMarkers(view);
  installMapPresenceFrame(view);
  installMapPresenceRefresh(view);
  initializeMapPresence(view);
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.target.closest?.('.map-presence__person')) view.focusedPersonId = null;
    },
    { signal: view.listeners.signal },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && view.drag) {
        view.endDrag();
        view.update();
        event.stopPropagation();
      }
      if (event.key === 'Escape' && view.focusedPersonId) {
        view.focusedPersonId = null;
        event.stopPropagation();
      }
    },
    { signal: view.listeners.signal },
  );
  view.refreshVisible = () => {
    if (document.visibilityState !== 'hidden') void view.refresh();
  };
  view.refreshAfterWrite = () => {
    view.retryAttempt = 0;
    view.refreshQueued = true;
    clearTimeout(view.retryTimer);
    view.retryTimer = null;
    if (!view.pending) view.refreshVisible();
  };
  window.addEventListener(
    'blur',
    () => {
      view.endDrag();
      view.update();
    },
    { signal: view.listeners.signal },
  );
  window.addEventListener('focus', view.refreshVisible, { signal: view.listeners.signal });
  document.addEventListener('visibilitychange', view.refreshVisible, {
    signal: view.listeners.signal,
  });
  document.addEventListener('campus-map-updated', view.refreshAfterWrite, {
    signal: view.listeners.signal,
  });
  view.poll = setInterval(view.refreshVisible, 30000);
  view.expiry = setInterval(view.expire, 1000);
  void view.refresh();
  return Object.freeze({
    update: view.update,
    refresh: view.refresh,
    snapshot: () => ({
      status: view.status,
      observedAt: view.observedAt,
      count: view.groups.reduce((sum, group) => sum + group.items.length, 0),
      buildings: view.groups.map((group) => ({
        id: group.building.id,
        visible: group.visible,
        count: group.items.length,
      })),
    }),
    dispose() {
      view.disposed = true;
      view.onCatalogueChange([]);
      view.endDrag(false);
      view.requestController?.abort();
      clearTimeout(view.retryTimer);
      clearInterval(view.poll);
      clearInterval(view.expiry);
      view.listeners.abort();
      view.layout.dispose();
      view.layer.remove();
    },
  });
}
