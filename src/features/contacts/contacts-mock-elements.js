import {
  emptyFields,
  el,
  button,
  icon,
  defaultFilters,
  filterIcon,
} from './contacts-mock-helpers.js';

export function initializeContactsMock(view) {
  view.entered = false;
  view.disposed = false;
  view.closing = false;
  view.closeTimer = undefined;
  view.previousFocus = undefined;
  view.contacts = [];
  view.nextOffset = null;
  view.query = '';
  view.filters = defaultFilters();
  view.searchTimer = undefined;
  view.listGeneration = 0;
  view.detailGeneration = 0;
  view.listController = undefined;
  view.detailController = undefined;
  view.mutationController = undefined;
  view.listLoading = false;
  view.listError = undefined;
  view.retryOffset = 0;
  view.selected = null;
  view.requestedId = null;
  view.detailLoading = false;
  view.detailError = null;
  view.preserveDraftOnRetry = false;
  view.mode = 'detail';
  view.mobileView = 'list';
  view.draft = emptyFields();
  view.baseline = emptyFields();
  view.busy = false;
  view.writeUncertain = false;
  view.confirmDelete = false;
  view.pendingNavigation = undefined;
  view.noticeText = '';
  view.noticeKind = '';
  view.noticeAction = undefined;
  view.root = el('div', 'campus-contacts');
  view.root.hidden = true;
  view.launcher = button('contacts-launcher', '', () => view.open());
  view.launcher.setAttribute('aria-label', 'Open contacts');
  view.launcher.setAttribute('aria-expanded', 'false');
  view.launcher.setAttribute('aria-controls', 'campus-contacts-panel');
  view.launcher.title = 'Contacts';
  view.launcherAvatar = el('span', 'contacts-launcher-avatar');
  view.launcherAvatar.setAttribute('aria-hidden', 'true');
  view.launcher.append(view.launcherAvatar);
  view.panel = el('dialog', 'contacts-panel');
  view.panel.id = 'campus-contacts-panel';
  view.panel.hidden = true;
  view.panel.setAttribute('aria-labelledby', 'contacts-heading');
  view.header = el('header', 'contacts-header');
  view.heading = el('div', 'contacts-heading');
  view.title = el('h2', '', 'Contacts');
  view.title.id = 'contacts-heading';
  view.heading.append(view.title);
  view.headerActions = el('div', 'contacts-header-actions');
  view.addButton = button('contacts-button contacts-button--add', '', () =>
    view.navigate(() => view.beginCreate()),
  );
  view.addButton.append(icon('plus'), el('span', '', 'Add contact'));
  view.closeButton = button('contacts-close', '×', view.close);
  view.closeButton.setAttribute('aria-label', 'Close contacts');
  view.headerActions.append(view.addButton, view.closeButton);
  view.header.append(view.heading, view.headerActions);
  view.body = el('div', 'contacts-body');
  view.sidebar = el('section', 'contacts-sidebar');
  view.sidebar.setAttribute('aria-label', 'Contact directory');
  view.searchBox = el('div', 'contacts-search');
  view.searchBox.append(icon('search'));
  view.search = el('input');
  view.search.type = 'search';
  view.search.maxLength = 256;
  view.search.placeholder = 'Search contacts';
  view.search.setAttribute('aria-label', 'Search contacts');
  view.search.autocomplete = 'off';
  view.searchBox.append(view.search);
  view.searchToolbar = el('div', 'contacts-search-toolbar');
  view.filterToggle = button('contacts-filter-toggle', '', () =>
    view.setFiltersOpen(view.filterPanel.hidden),
  );
  view.filterToggle.append(filterIcon());
  view.filterToggle.setAttribute('aria-label', 'Filters');
  view.filterToggle.title = 'Filters';
  view.filterToggle.setAttribute('aria-expanded', 'false');
  view.filterToggle.setAttribute('aria-controls', 'contacts-filter-panel');
  view.filterPanel = el('form', 'contacts-filter-panel');
  view.filterPanel.id = 'contacts-filter-panel';
  view.filterPanel.hidden = true;
  view.filterPanel.setAttribute('role', 'group');
  view.filterPanel.setAttribute('aria-label', 'Contact filters');
  view.filterPanel.autocomplete = 'off';
  view.filterGrid = el('div', 'contacts-filter-grid');
  view.filterControls = {};
  for (const [key, labelText, options] of [
    ['name', 'Name'],
    ['workplace', 'Workplace'],
    [
      'emailPresence',
      'Email presence',
      [
        ['any', 'Any'],
        ['yes', 'Has email'],
        ['no', 'No email'],
      ],
    ],
    [
      'phonePresence',
      'Phone presence',
      [
        ['any', 'Any'],
        ['yes', 'Has phone'],
        ['no', 'No phone'],
      ],
    ],
    [
      'sort',
      'Sort',
      [
        ['auto', 'Automatic'],
        ['relevance', 'Relevance'],
        ['name_asc', 'Name A–Z'],
        ['name_desc', 'Name Z–A'],
        ['newest', 'Newest first'],
        ['oldest', 'Oldest first'],
      ],
    ],
  ]) {
    const group = el(
      'div',
      `contacts-filter-field${['name', 'workplace', 'sort'].includes(key) ? ' contacts-filter-field--wide' : ''}`,
    );
    const label = el('label', '', labelText),
      control = el(options ? 'select' : 'input');
    control.id = `contacts-filter-${key}`;
    control.name = key;
    label.htmlFor = control.id;
    if (options)
      for (const [value, text] of options) {
        const option = el('option', '', text);
        option.value = value;
        control.append(option);
      }
    else {
      control.type = 'text';
      control.maxLength = key === 'name' ? 200 : 500;
    }
    control.value = view.filters[key];
    view.filterControls[key] = control;
    group.append(label, control);
    view.filterGrid.append(group);
  }
  view.filterActions = el('div', 'contacts-filter-actions');
  view.applyFilters = button('contacts-button contacts-button--primary', 'Apply');
  view.applyFilters.type = 'submit';
  view.applyFilters.setAttribute('aria-label', 'Apply filters');
  view.resetFilters = button('contacts-button contacts-button--add', 'Reset', () => {
    view.filters = defaultFilters();
    for (const [key, control] of Object.entries(view.filterControls))
      control.value = view.filters[key];
    view.updateFiltersIndicator();
    clearTimeout(view.searchTimer);
    void view.loadList(0);
  });
  view.resetFilters.setAttribute('aria-label', 'Reset filters');
  view.filterActions.append(view.resetFilters, view.applyFilters);
  view.filterPanel.append(view.filterGrid, view.filterActions);
  view.filterPanel.addEventListener('submit', (event) => {
    event.preventDefault();
    view.filters = Object.fromEntries(
      Object.entries(view.filterControls).map(([key, control]) => [key, control.value.trim()]),
    );
    view.updateFiltersIndicator();
    clearTimeout(view.searchTimer);
    void view.loadList(0);
  });
  view.searchToolbar.append(view.searchBox, view.filterToggle);
  view.listMeta = el('p', 'contacts-list-meta');
  view.listMeta.setAttribute('role', 'status');
  view.list = el('ul', 'contacts-list');
  view.list.setAttribute('aria-label', 'Contacts');
  view.listState = el('div', 'contacts-list-state');
  view.loadMore = button(
    'contacts-button contacts-load-more',
    'Load more',
    () => void view.loadList(view.nextOffset ?? 0),
  );
  view.loadMore.hidden = true;
  view.sidebar.append(
    view.searchToolbar,
    view.filterPanel,
    view.listMeta,
    view.list,
    view.listState,
    view.loadMore,
  );
  view.detail = el('section', 'contacts-detail');
  view.detail.setAttribute('aria-label', 'Contact details');
  view.body.append(view.sidebar, view.detail);
  view.panel.append(view.header, view.body);
  view.root.append(view.launcher, view.panel);
  view.container.append(view.root);
}
