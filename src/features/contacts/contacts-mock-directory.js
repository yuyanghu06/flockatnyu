import { nameOf, initialsOf, el, button, icon, messageFor } from './contacts-mock-helpers.js';

export function installContactsMockDirectory(view) {
  view.setFiltersOpen = function setFiltersOpen(value, restoreFocus = false) {
    view.filterPanel.hidden = !value;
    view.filterToggle.setAttribute('aria-expanded', String(value));
    if (restoreFocus) view.filterToggle.focus();
  };
  view.updateFiltersIndicator = function updateFiltersIndicator() {
    const active = Boolean(
      view.filters.name ||
      view.filters.workplace ||
      view.filters.emailPresence !== 'any' ||
      view.filters.phonePresence !== 'any' ||
      view.filters.sort !== 'auto',
    );
    view.filterToggle.classList.toggle('is-active', active);
    view.filterToggle.title = active ? 'Filters active' : 'Filters';
  };
  view.setView = function setView(value) {
    view.mobileView = value;
    view.panel.dataset.view = value;
  };
  view.setNotice = function setNotice(text = '', kind = '', action) {
    view.noticeText = text;
    view.noticeKind = kind;
    view.noticeAction = action;
    view.renderNotice();
  };
  view.renderNotice = function renderNotice() {
    const area = view.detail.querySelector('.contacts-notice');
    if (!area) return;
    area.replaceChildren();
    area.hidden = !view.noticeText && !view.pendingNavigation;
    area.className = `contacts-notice${view.noticeKind ? ` is-${view.noticeKind}` : ''}`;
    area.setAttribute('role', view.noticeKind === 'error' ? 'alert' : 'status');
    if (view.pendingNavigation) {
      area.append(el('p', '', 'You have unsaved changes.'));
      const actions = el('div', 'contacts-inline-actions');
      actions.append(
        button('contacts-text-button', 'Keep editing', () => {
          view.pendingNavigation = undefined;
          view.renderNotice();
        }),
        button('contacts-text-button', 'Discard changes', () => {
          const action = view.pendingNavigation;
          view.pendingNavigation = undefined;
          view.draft = { ...view.baseline };
          action?.();
        }),
      );
      area.append(actions);
    } else if (view.noticeText) {
      area.append(el('p', '', view.noticeText));
      if (view.noticeAction)
        area.append(button('contacts-text-button', view.noticeAction.label, view.noticeAction.run));
    }
  };
  view.navigate = function navigate(action) {
    if (view.busy) return;
    if (view.dirty()) {
      view.pendingNavigation = action;
      view.renderNotice();
      return;
    }
    view.pendingNavigation = undefined;
    action();
  };
  view.backButton = function backButton() {
    const back = button('contacts-back contacts-text-button', '', () =>
      view.navigate(() => {
        view.setView('list');
        view.mode = 'detail';
        view.renderDetail();
      }),
    );
    back.append(icon('back'), el('span', '', 'All contacts'));
    return back;
  };
  view.renderList = function renderList() {
    view.sidebar.setAttribute('aria-busy', String(view.listLoading));
    view.list.replaceChildren();
    view.listState.replaceChildren();
    view.listMeta.textContent = view.listLoading
      ? view.contacts.length
        ? 'Loading more…'
        : view.query
          ? 'Searching…'
          : 'Loading contacts…'
      : view.contacts.length
        ? `${view.contacts.length} ${view.contacts.length === 1 ? 'contact' : 'contacts'}${view.nextOffset !== null ? ' shown' : ''}`
        : '';
    for (const contact of view.contacts) {
      const item = el('li'),
        row = button('contacts-row', '', () =>
          view.navigate(() => void view.selectContact(contact.id)),
        );
      row.setAttribute(
        'aria-pressed',
        String(view.selected?.id === contact.id && view.mode !== 'create'),
      );
      row.dataset.contactId = contact.id;
      const avatar = el('span', 'contacts-avatar', initialsOf(contact));
      avatar.setAttribute('aria-hidden', 'true');
      const summary = el('span', 'contacts-row-summary');
      summary.append(el('strong', '', nameOf(contact)));
      const subtitle =
        contact.fields.workplace || contact.fields.email || contact.fields.phone_number;
      if (subtitle) summary.append(el('span', '', subtitle));
      row.append(avatar, summary);
      item.append(row);
      view.list.append(item);
    }
    if (view.listError) {
      view.listState.append(
        el('p', '', messageFor(view.listError)),
        button('contacts-text-button', 'Retry', () => void view.loadList(view.retryOffset)),
      );
      view.listState.setAttribute('role', 'alert');
    } else if (!view.listLoading && !view.contacts.length) {
      view.listState.removeAttribute('role');
      view.listState.append(
        el('strong', '', view.query || view.hasFilters() ? 'No matches' : 'No contacts yet'),
        el(
          'p',
          '',
          view.query || view.hasFilters()
            ? 'Try another search or adjust your filters.'
            : 'Add someone to get started.',
        ),
      );
    }
    view.loadMore.hidden = view.nextOffset === null || Boolean(view.listError);
    view.loadMore.disabled = view.listLoading || view.busy;
  };
  view.loadList = async function loadList(offset = 0) {
    const generation = ++view.listGeneration,
      requestedQuery = view.query,
      requestedFilters = { ...view.filters };
    view.listController?.abort();
    const controller = (view.listController = new AbortController());
    view.listLoading = true;
    view.listError = null;
    view.retryOffset = offset;
    if (!offset) {
      view.contacts = [];
      view.nextOffset = null;
    }
    view.renderList();
    let result;
    try {
      result = await view.client.search({
        query: requestedQuery,
        limit: 10,
        offset,
        ...requestedFilters,
        signal: controller.signal,
      });
    } catch {
      result = { status: 'unavailable' };
    }
    if (view.disposed || generation !== view.listGeneration || controller.signal.aborted) return;
    view.listLoading = false;
    if (result?.status === 'ready') {
      const previous = offset ? view.contacts : [],
        seen = new Set(previous.map((contact) => contact.id));
      view.contacts = [...previous, ...result.contacts.filter((contact) => !seen.has(contact.id))];
      view.nextOffset = result.coverage.nextOffset;
    } else view.listError = result;
    view.renderList();
  };
}
