import { createContactsClient } from './contacts-client.js';
import { keys, emptyFields } from './contacts-helpers.js';

import { installContactsDirectory } from './contacts-directory.js';
import { installContactsDetail } from './contacts-detail.js';
import { installContactsMutations } from './contacts-mutations.js';
import { installContactsLifecycle } from './contacts-lifecycle.js';
import { initializeContacts } from './contacts-elements.js';
export function createContacts({
  container = document.body,
  client = createContactsClient(),
  onFlockContact,
} = {}) {
  const view = { container, client, onFlockContact };
  installContactsDirectory(view);
  installContactsDetail(view);
  installContactsMutations(view);
  installContactsLifecycle(view);
  initializeContacts(view);
  view.dirty = () =>
    (view.mode === 'create' || Boolean(view.selected)) &&
    keys.some((key) => view.draft[key] !== view.baseline[key]);
  view.changedFields = () =>
    Object.fromEntries(
      keys
        .filter((key) => view.draft[key] !== view.baseline[key])
        .map((key) => [key, view.draft[key]]),
    );
  view.hasFilters = () =>
    Boolean(
      view.filters.name ||
      view.filters.workplace ||
      view.filters.emailPresence !== 'any' ||
      view.filters.phonePresence !== 'any',
    );
  for (const event of [
    'pointerdown',
    'pointermove',
    'pointerup',
    'pointercancel',
    'wheel',
    'click',
    'dblclick',
    'touchstart',
    'touchmove',
    'touchend',
    'keyup',
  ])
    view.root.addEventListener(event, view.preventMap);
  view.launcher.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key?.toLowerCase() === 'k') return;
    event.stopPropagation();
  });
  view.panel.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape' && !view.filterPanel.hidden) {
      event.preventDefault();
      view.setFiltersOpen(false, true);
    }
    if ((event.metaKey || event.ctrlKey) && event.key?.toLowerCase() === 'k')
      event.preventDefault();
  });
  view.panel.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!view.filterPanel.hidden) view.setFiltersOpen(false, true);
    else view.close();
  });
  view.panel.addEventListener('click', (event) => {
    if (event.target !== view.panel) return;
    const rect = view.panel.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      view.close();
  });
  view.search.addEventListener('input', () => {
    clearTimeout(view.searchTimer);
    view.query = view.search.value;
    view.searchTimer = setTimeout(() => void view.loadList(0), 220);
  });
  document.addEventListener('campus-enter', view.onEnter);
  document.addEventListener('campus-loading-failed', view.onFailure);
  view.renderList();
  view.renderDetail();
  view.setView(view.mobileView);
  return Object.freeze({
    launcher: view.launcher,
    open: view.open,
    close: view.close,
    dispose() {
      if (view.disposed) return;
      view.disposed = true;
      view.close({ immediate: true });
      clearTimeout(view.searchTimer);
      view.listController?.abort();
      view.detailController?.abort();
      view.mutationController?.abort();
      document.removeEventListener('campus-enter', view.onEnter);
      document.removeEventListener('campus-loading-failed', view.onFailure);
      view.launcher.remove();
      view.root.remove();
      view.contacts = [];
      view.selected = null;
      view.draft = emptyFields();
      view.baseline = emptyFields();
    },
  });
}
