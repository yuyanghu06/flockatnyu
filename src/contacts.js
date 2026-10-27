import { createContactsClient, CONTACT_FIELD_LIMITS } from './contacts-client.js';

const labels = { first_name: 'First name', last_name: 'Last name', email: 'Email', phone_number: 'Phone', workplace: 'Workplace', notes: 'Notes' };
const keys = Object.keys(labels);
const emptyFields = () => Object.fromEntries(keys.map(key => [key, '']));
const nameOf = contact => [contact.fields.first_name, contact.fields.last_name].filter(Boolean).join(' ') || contact.fields.email || contact.fields.workplace || 'Unnamed contact';
const initialsOf = contact => [contact.fields.first_name, contact.fields.last_name].filter(Boolean).map(text => Array.from(text.trim())[0] || '').join('').slice(0, 2).toUpperCase() || '·';
function el(tag, className, text) {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
}
function button(className, text, action) { const node = el('button', className, text); node.type = 'button'; if (action) node.addEventListener('click', action); return node; }
function icon(kind = 'book') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) node.setAttribute(key, value);
  const paths = kind === 'search' ? ['M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z', 'm16 16 4 4']
    : kind === 'plus' ? ['M12 5v14M5 12h14'] : kind === 'back' ? ['m14 6-6 6 6 6']
      : kind === 'refresh' ? ['M20 4v5h-5', 'M20 9a8 8 0 1 0 .1 5']
      : ['M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6V3Z', 'M3 7h4M3 12h4M3 17h4', 'M13 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z', 'M10 17v-1a3 3 0 0 1 6 0v1'];
  for (const d of paths) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); node.append(path); } return node;
}
const defaultFilters = () => ({ name: '', workplace: '', emailPresence: 'any', phonePresence: 'any', sort: 'auto' });
let filterIconSequence = 0;
let editorFormSequence = 0;
function filterIcon() {
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS(ns, 'defs'), gradient = document.createElementNS(ns, 'linearGradient');
  const gradientId = 'contacts-filter-gradient-' + ++filterIconSequence;
  gradient.id = gradientId;
  for (const [key, value] of Object.entries({ x1: '0%', y1: '0%', x2: '95%', y2: '100%' })) gradient.setAttribute(key, value);
  for (const [offset, color] of [['0%', '#f0ba72'], ['20%', '#f3a4b8'], ['42%', '#d59bea'], ['63%', '#8faff0'], ['83%', '#82d2d2'], ['100%', '#a5d6a3']]) {
    const stop = document.createElementNS(ns, 'stop'); stop.setAttribute('offset', offset); stop.setAttribute('stop-color', color); gradient.append(stop);
  }
  defs.append(gradient);
  const funnel = document.createElementNS(ns, 'path');
  funnel.setAttribute('d', 'M4.2 4.5h15.6c.7 0 1.1.8.6 1.4L14 13.2v5.4c0 .4-.2.7-.6.9l-2.6 1.1c-.5.2-1.1-.2-1.1-.8v-6.6L3.6 5.9c-.5-.6-.1-1.4.6-1.4Z');
  funnel.setAttribute('class', 'contacts-filter-shape'); funnel.setAttribute('fill', 'none');
  funnel.setAttribute('stroke', `url(#${gradientId})`); funnel.setAttribute('stroke-width', '1.7'); funnel.setAttribute('stroke-linejoin', 'round');
  funnel.style.setProperty('--contacts-funnel-fill', `url(#${gradientId})`);
  const highlight = document.createElementNS(ns, 'path'); highlight.setAttribute('class', 'contacts-filter-highlight'); highlight.setAttribute('d', 'M5.3 5.4h13.4l-1.2 1.4H6.5Z'); highlight.setAttribute('fill', '#ffffff66');
  svg.append(defs, funnel, highlight); return svg;
}
function messageFor(result, action = 'load contacts') {
  if (result?.reason === 'write_outcome_unknown') return 'The change wasn’t confirmed. Check the saved contacts before trying again.';
  if (result?.status === 'forbidden') return 'Contacts aren’t available with your current access. Sign in again, then retry.';
  if (result?.status === 'conflict') return 'This contact changed since you opened it. Reload the saved contact, then review your changes.';
  if (result?.status === 'not_found') return 'This contact is no longer available. Refresh the list to see the latest contacts.';
  if (result?.status === 'invalid_request') return 'Check the contact details and try again.';
  if (result?.status === 'rate_limited') return 'Please wait a moment, then try again.';
  return `Couldn’t ${action}. Your changes are still here. Check your connection and retry.`;
}

export function createContacts({ container = document.body, client = createContactsClient(), onFlockContact } = {}) {
  let entered = false, disposed = false, closing = false, closeTimer, previousFocus;
  let contacts = [], nextOffset = null, query = '', filters = defaultFilters(), searchTimer, listGeneration = 0, detailGeneration = 0;
  let listController, detailController, mutationController, listLoading = false, listError, retryOffset = 0;
  let selected = null, requestedId = null, detailLoading = false, detailError = null, preserveDraftOnRetry = false, mode = 'detail', mobileView = 'list';
  let draft = emptyFields(), baseline = emptyFields(), busy = false, writeUncertain = false, confirmDelete = false, pendingNavigation;
  let noticeText = '', noticeKind = '', noticeAction;
  const root = el('div', 'campus-contacts'); root.hidden = true;
  const launcher = button('contacts-launcher', '', () => open());
  launcher.setAttribute('aria-label', 'Open contacts'); launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-controls', 'campus-contacts-panel');
  launcher.title = 'Contacts';
  const launcherAvatar = el('span', 'contacts-launcher-avatar'); launcherAvatar.setAttribute('aria-hidden', 'true');
  launcher.append(launcherAvatar);
  const panel = el('dialog', 'contacts-panel'); panel.id = 'campus-contacts-panel'; panel.hidden = true; panel.setAttribute('aria-labelledby', 'contacts-heading');
  const header = el('header', 'contacts-header'), heading = el('div', 'contacts-heading');
  const title = el('h2', '', 'Contacts'); title.id = 'contacts-heading';
  heading.append(title);
  const headerActions = el('div', 'contacts-header-actions');
  const refreshButton = button('contacts-button contacts-button--add contacts-refresh', '', () => { clearTimeout(searchTimer); void loadList(0); });
  refreshButton.setAttribute('aria-label', 'Refresh contacts'); refreshButton.title = 'Refresh contacts'; refreshButton.append(icon('refresh'));
  const addButton = button('contacts-button contacts-button--add', '', () => navigate(() => beginCreate())); addButton.append(icon('plus'), el('span', '', 'Add contact'));
  const flockButton = button('contacts-button contacts-button--add contacts-flock', 'Flock it!', () => {
    if (!selected || mode === 'create' || detailLoading || detailError || busy || writeUncertain || typeof onFlockContact !== 'function') return;
    const contact = { id: selected.id, first_name: selected.fields.first_name, last_name: selected.fields.last_name };
    close({ immediate: true });
    onFlockContact(contact);
  }); flockButton.hidden = true;
  const closeButton = button('contacts-close', '×', close); closeButton.setAttribute('aria-label', 'Close contacts');
  headerActions.append(refreshButton, addButton, closeButton); header.append(heading, headerActions);
  const body = el('div', 'contacts-body'), sidebar = el('section', 'contacts-sidebar'); sidebar.setAttribute('aria-label', 'Contact directory');
  const searchBox = el('div', 'contacts-search'); searchBox.append(icon('search'));
  const search = el('input'); search.type = 'search'; search.maxLength = 256; search.placeholder = 'Search contacts'; search.setAttribute('aria-label', 'Search contacts'); search.autocomplete = 'off';
  searchBox.append(search);
  const searchToolbar = el('div', 'contacts-search-toolbar');
  const filterToggle = button('contacts-filter-toggle', '', () => setFiltersOpen(filterPanel.hidden));
  filterToggle.append(filterIcon()); filterToggle.setAttribute('aria-label', 'Filters'); filterToggle.title = 'Filters';
  filterToggle.setAttribute('aria-expanded', 'false'); filterToggle.setAttribute('aria-controls', 'contacts-filter-panel');
  const filterPanel = el('form', 'contacts-filter-panel'); filterPanel.id = 'contacts-filter-panel'; filterPanel.hidden = true;
  filterPanel.setAttribute('role', 'group'); filterPanel.setAttribute('aria-label', 'Contact filters'); filterPanel.autocomplete = 'off';
  const filterGrid = el('div', 'contacts-filter-grid'), filterControls = {};
  for (const [key, labelText, options] of [
    ['name', 'Name'], ['workplace', 'Workplace'],
    ['emailPresence', 'Email presence', [['any', 'Any'], ['yes', 'Has email'], ['no', 'No email']]],
    ['phonePresence', 'Phone presence', [['any', 'Any'], ['yes', 'Has phone'], ['no', 'No phone']]],
    ['sort', 'Sort', [['auto', 'Automatic'], ['relevance', 'Relevance'], ['name_asc', 'Name A–Z'], ['name_desc', 'Name Z–A'], ['newest', 'Newest first'], ['oldest', 'Oldest first']]],
  ]) {
    const group = el('div', `contacts-filter-field${['name', 'workplace', 'sort'].includes(key) ? ' contacts-filter-field--wide' : ''}`);
    const label = el('label', '', labelText), control = el(options ? 'select' : 'input');
    control.id = `contacts-filter-${key}`; control.name = key; label.htmlFor = control.id;
    if (options) for (const [value, text] of options) { const option = el('option', '', text); option.value = value; control.append(option); }
    else { control.type = 'text'; control.maxLength = key === 'name' ? 200 : 500; }
    control.value = filters[key]; filterControls[key] = control; group.append(label, control); filterGrid.append(group);
  }
  const filterActions = el('div', 'contacts-filter-actions');
  const applyFilters = button('contacts-button contacts-button--primary', 'Apply'); applyFilters.type = 'submit'; applyFilters.setAttribute('aria-label', 'Apply filters');
  const resetFilters = button('contacts-button contacts-button--add', 'Reset', () => {
    filters = defaultFilters(); for (const [key, control] of Object.entries(filterControls)) control.value = filters[key];
    updateFiltersIndicator(); clearTimeout(searchTimer); void loadList(0);
  }); resetFilters.setAttribute('aria-label', 'Reset filters');
  filterActions.append(resetFilters, applyFilters); filterPanel.append(filterGrid, filterActions);
  filterPanel.addEventListener('submit', event => {
    event.preventDefault(); filters = Object.fromEntries(Object.entries(filterControls).map(([key, control]) => [key, control.value.trim()]));
    updateFiltersIndicator(); clearTimeout(searchTimer); void loadList(0);
  });
  searchToolbar.append(searchBox, filterToggle);
  const listMeta = el('p', 'contacts-list-meta'); listMeta.setAttribute('role', 'status');
  const list = el('ul', 'contacts-list'); list.setAttribute('aria-label', 'Contacts');
  const listState = el('div', 'contacts-list-state');
  const loadMore = button('contacts-button contacts-load-more', 'Load more', () => void loadList(nextOffset ?? 0)); loadMore.hidden = true;
  sidebar.append(searchToolbar, filterPanel, listMeta, list, listState, loadMore);
  const detail = el('section', 'contacts-detail'); detail.setAttribute('aria-label', 'Contact details');
  const detailScroll = el('div', 'contacts-detail-scroll');
  body.append(sidebar, detail);
  panel.append(header, body); root.append(launcher, panel); container.append(root);
  const dirty = () => (mode === 'create' || Boolean(selected)) && keys.some(key => draft[key] !== baseline[key]);
  const changedFields = () => Object.fromEntries(keys.filter(key => draft[key] !== baseline[key]).map(key => [key, draft[key]]));
  function setFiltersOpen(value, restoreFocus = false) {
    filterPanel.hidden = !value; filterToggle.setAttribute('aria-expanded', String(value));
    if (restoreFocus) filterToggle.focus();
  }
  function updateFiltersIndicator() {
    const active = Boolean(filters.name || filters.workplace || filters.emailPresence !== 'any' || filters.phonePresence !== 'any' || filters.sort !== 'auto');
    filterToggle.classList.toggle('is-active', active); filterToggle.title = active ? 'Filters active' : 'Filters';
  }
  const hasFilters = () => Boolean(filters.name || filters.workplace || filters.emailPresence !== 'any' || filters.phonePresence !== 'any');
  function setView(value) { mobileView = value; panel.dataset.view = value; }
  function setNotice(text = '', kind = '', action) { noticeText = text; noticeKind = kind; noticeAction = action; renderNotice(); }
  function renderNotice() {
    const area = detail.querySelector('.contacts-notice'); if (!area) return;
    area.replaceChildren(); area.hidden = !noticeText && !pendingNavigation; area.className = `contacts-notice${noticeKind ? ` is-${noticeKind}` : ''}`;
    area.setAttribute('role', noticeKind === 'error' ? 'alert' : 'status');
    if (pendingNavigation) {
      area.append(el('p', '', 'You have unsaved changes.'));
      const actions = el('div', 'contacts-inline-actions');
      actions.append(button('contacts-text-button', 'Keep editing', () => { pendingNavigation = undefined; renderNotice(); }),
        button('contacts-text-button', 'Discard changes', () => { const action = pendingNavigation; pendingNavigation = undefined; draft = { ...baseline }; action?.(); })); area.append(actions);
    } else if (noticeText) {
      area.append(el('p', '', noticeText)); if (noticeAction) area.append(button('contacts-text-button', noticeAction.label, noticeAction.run));
    }
  }
  function navigate(action) {
    if (busy) return;
    if (dirty()) { pendingNavigation = action; renderNotice(); return; }
    pendingNavigation = undefined; action();
  }
  function backButton() {
    const back = button('contacts-back contacts-text-button', '', () => navigate(() => { setView('list'); mode = 'detail'; renderDetail(); }));
    back.append(icon('back'), el('span', '', 'All contacts')); return back;
  }
  function renderList() {
    refreshButton.disabled = listLoading || busy;
    sidebar.setAttribute('aria-busy', String(listLoading)); list.replaceChildren(); listState.replaceChildren();
    listMeta.textContent = listLoading ? contacts.length ? 'Loading more…' : query ? 'Searching…' : 'Loading contacts…'
      : contacts.length ? `${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}${nextOffset !== null ? ' shown' : ''}` : '';
    for (const contact of contacts) {
      const item = el('li'), row = button('contacts-row', '', () => navigate(() => void selectContact(contact.id)));
      row.setAttribute('aria-pressed', String((requestedId ?? selected?.id) === contact.id && mode !== 'create')); row.dataset.contactId = contact.id;
      const avatar = el('span', 'contacts-avatar', initialsOf(contact)); avatar.setAttribute('aria-hidden', 'true');
      const summary = el('span', 'contacts-row-summary'); summary.append(el('strong', '', nameOf(contact)));
      const subtitle = contact.fields.workplace || contact.fields.email || contact.fields.phone_number;
      if (subtitle) summary.append(el('span', '', subtitle)); row.append(avatar, summary); item.append(row); list.append(item);
    }
    if (listError) {
      listState.append(el('p', '', messageFor(listError)), button('contacts-text-button', 'Retry', () => void loadList(retryOffset)));
      listState.setAttribute('role', 'alert');
    } else if (!listLoading && !contacts.length) {
      listState.removeAttribute('role'); listState.append(el('strong', '', query || hasFilters() ? 'No matches' : 'No contacts yet'),
        el('p', '', query || hasFilters() ? 'Try another search or adjust your filters.' : 'Add someone to get started.'));
    }
    loadMore.hidden = nextOffset === null || Boolean(listError); loadMore.disabled = listLoading || busy;
  }
  async function loadList(offset = 0) {
    const generation = ++listGeneration, requestedQuery = query, requestedFilters = { ...filters };
    listController?.abort(); const controller = listController = new AbortController();
    listLoading = true; listError = null; retryOffset = offset; if (!offset) { contacts = []; nextOffset = null; } renderList();
    let result; try { result = await client.search({ query: requestedQuery, limit: 10, offset, ...requestedFilters, signal: controller.signal }); } catch { result = { status: 'unavailable' }; }
    if (disposed || generation !== listGeneration || controller.signal.aborted) return;
    listLoading = false;
    if (result?.status === 'ready') {
      const previous = offset ? contacts : [], seen = new Set(previous.map(contact => contact.id));
      contacts = [...previous, ...result.contacts.filter(contact => !seen.has(contact.id))]; nextOffset = result.coverage.nextOffset;
    } else listError = result;
    renderList();
  }
  function detailBase() {
    detail.replaceChildren(detailScroll); detailScroll.replaceChildren(backButton());
    const notice = el('div', 'contacts-notice'); notice.hidden = true; detailScroll.append(notice);
    flockButton.hidden = !selected || mode === 'create' || detailLoading || Boolean(detailError) || typeof onFlockContact !== 'function';
    flockButton.disabled = busy || writeUncertain;
  }
  function renderDetail() {
    detailBase();
    if (detailLoading) { detailScroll.append(el('p', 'contacts-detail-state', 'Loading contact…')); return; }
    if (detailError) {
      detailScroll.append(el('h3', 'contacts-detail-title', 'Contact unavailable'), el('p', 'contacts-detail-state', messageFor(detailError)),
        button('contacts-text-button', 'Retry', () => void selectContact(requestedId, { preserveDraft: preserveDraftOnRetry }))); return;
    }
    if (mode === 'create') { renderEditor(); renderNotice(); return; }
    if (!selected) {
      const empty = el('div', 'contacts-welcome'); empty.append(icon(), el('h3', '', 'A place for your people'), el('p', '', 'Choose a contact to see their details, or add someone new.'));
      detailScroll.append(empty); renderNotice(); return;
    }
    const intro = el('div', 'contacts-profile'), identity = el('div', 'contacts-profile-identity');
    identity.append(el('h3', 'contacts-detail-title', nameOf(selected)));
    if (selected.fields.workplace) identity.append(el('p', 'contacts-profile-workplace', selected.fields.workplace));
    intro.append(el('span', 'contacts-avatar contacts-avatar--large', initialsOf(selected)), identity);
    const actions = el('div', 'contacts-detail-actions');
    const remove = button('contacts-delete', '×', () => { confirmDelete = true; setNotice(); renderDetail(); });
    remove.setAttribute('aria-label', 'Delete contact'); remove.title = 'Delete contact'; remove.disabled = busy;
    actions.append(flockButton, remove); intro.append(actions); detailScroll.append(intro);
    if (confirmDelete) {
      const confirmation = el('div', 'contacts-delete-confirmation'); confirmation.setAttribute('role', 'group'); confirmation.setAttribute('aria-label', 'Confirm contact deletion');
      confirmation.append(el('strong', '', `Delete ${nameOf(selected)}?`), el('p', '', 'This removes their saved contact details.'));
      const actions = el('div', 'contacts-inline-actions');
      const remove = button('contacts-button contacts-button--danger', busy ? 'Deleting…' : 'Delete contact', () => void removeContact()); remove.disabled = busy || writeUncertain;
      const cancel = button('contacts-text-button', 'Cancel', () => { confirmDelete = false; setNotice(); renderDetail(); }); cancel.disabled = busy;
      actions.append(remove, cancel); confirmation.append(actions); detailScroll.append(confirmation);
    }
    renderEditor({ inline: true });
    renderNotice();
  }
  function beginCreate() {
    detailController?.abort(); detailGeneration++; selected = null; requestedId = null; detailLoading = false; detailError = null;
    draft = emptyFields(); baseline = emptyFields(); mode = 'create'; confirmDelete = false; writeUncertain = false; noticeText = ''; noticeAction = undefined;
    setView('detail'); renderList(); renderDetail(); detail.querySelector('input')?.focus();
  }
  function renderEditor({ inline = false } = {}) {
    if (!inline) detailScroll.append(el('h3', 'contacts-detail-title', 'New contact'),
      el('p', 'contacts-editor-help', 'Keep what you know. You can fill in the rest later.'));
    const form = el('form', `contacts-editor${inline ? ' contacts-editor--inline' : ''}`); form.noValidate = true; form.autocomplete = 'off';
    form.id = `contacts-editor-form-${++editorFormSequence}`;
    const grid = el('div', 'contacts-editor-grid');
    for (const key of keys) {
      const group = el('div', `contacts-input-group${key === 'notes' ? ' contacts-input-group--wide' : ''}`), label = el('label', '', labels[key]);
      const input = el(key === 'notes' ? 'textarea' : 'input'); input.id = `contacts-${key}`; input.name = key; label.htmlFor = input.id;
      input.maxLength = CONTACT_FIELD_LIMITS[key]; input.value = draft[key]; input.disabled = busy; input.autocomplete = 'off';
      if (key === 'notes') { input.rows = 4; input.placeholder = 'How you met, what to follow up on…'; }
      else { input.type = 'text'; if (key === 'email') input.inputMode = 'email'; if (key === 'phone_number') input.inputMode = 'tel'; }
      input.addEventListener('focus', () => requestAnimationFrame(() => {
        if (document.activeElement !== input || !input.isConnected) return;
        const field = input.getBoundingClientRect(), viewport = detailScroll.getBoundingClientRect();
        // Chrome can scroll only a textarea's caret. Reveal its whole box when it fits.
        if (field.height <= detailScroll.clientHeight) {
          if (field.bottom > viewport.bottom) detailScroll.scrollTop += field.bottom - viewport.bottom;
          else if (field.top < viewport.top) detailScroll.scrollTop += field.top - viewport.top;
        }
      }));
      input.addEventListener('input', () => { draft[key] = input.value; updateSave(); }); group.append(label, input); grid.append(group);
    }
    const footer = el('div', 'contacts-editor-footer'), save = button('contacts-button contacts-button--primary', busy ? 'Saving…' : 'Save contact'); save.type = 'submit'; save.dataset.action = 'save';
    save.setAttribute('form', form.id);
    const cancel = button('contacts-text-button', 'Cancel', () => { if (busy) return; draft = { ...baseline }; mode = 'detail'; writeUncertain = false; pendingNavigation = undefined; setNotice(); if (!selected) setView('list'); renderDetail(); }); cancel.disabled = busy;
    footer.append(cancel, save); form.append(grid); form.addEventListener('submit', event => { event.preventDefault(); void saveContact(); });
    detailScroll.append(form); detail.append(footer); updateSave();
  }
  function updateSave() {
    const save = detail.querySelector('[data-action="save"]'); if (save) save.disabled = busy || writeUncertain || !dirty() || mode === 'create' && !keys.some(key => draft[key].trim());
    const footer = detail.querySelector('.contacts-editor-footer'); if (footer) footer.hidden = mode !== 'create' && !dirty();
    addButton.disabled = busy;
    refreshButton.disabled = listLoading || busy;
  }
  async function selectContact(id, { preserveDraft = false } = {}) {
    if (!id || busy) return;
    const generation = ++detailGeneration, changes = preserveDraft ? changedFields() : null; preserveDraftOnRetry = preserveDraft;
    detailController?.abort(); const controller = detailController = new AbortController(); requestedId = id; detailLoading = true; detailError = null;
    if (!preserveDraft) { mode = 'detail'; selected = null; noticeText = ''; noticeAction = undefined; writeUncertain = false; }
    confirmDelete = false; setView('detail'); renderList(); renderDetail();
    let result; try { result = await client.read({ contactId: id, signal: controller.signal }); } catch { result = { status: 'unavailable' }; }
    if (disposed || generation !== detailGeneration || controller.signal.aborted) return;
    detailLoading = false;
    if (result?.status === 'ready') {
      selected = result.contact;
      if (preserveDraft) { baseline = { ...selected.fields }; draft = { ...baseline, ...changes }; mode = 'edit'; writeUncertain = false;
        noticeText = 'Loaded the latest contact. Your changes are still here; review them before saving.'; noticeKind = 'info'; noticeAction = undefined; }
      else { baseline = { ...selected.fields }; draft = { ...selected.fields }; }
    } else { detailError = result; }
    renderList(); renderDetail();
  }
  async function saveContact() {
    if (busy || writeUncertain || !dirty() || mode === 'create' && !keys.some(key => draft[key].trim())) return;
    const creating = mode === 'create', fields = creating ? { ...draft } : changedFields(), target = selected;
    busy = true; pendingNavigation = undefined; setNotice(); renderEditorBusy();
    const controller = mutationController = new AbortController();
    let result; try { result = creating ? await client.create({ fields, signal: controller.signal })
      : await client.update({ contactId: target.id, expectedUpdatedAt: target.updated_at, fields, signal: controller.signal }); } catch { result = { status: 'unavailable', reason: 'write_outcome_unknown' }; }
    if (disposed) return; busy = false; addButton.disabled = false;
    if (result?.status === 'ready' && result.contactWrite && result.contact) {
      selected = result.contact; mode = 'detail'; draft = { ...selected.fields }; baseline = { ...selected.fields }; renderDetail();
      setNotice(creating ? 'Contact added.' : 'Changes saved.', 'success'); void loadList(0);
    } else {
      writeUncertain = result?.reason === 'write_outcome_unknown'; renderDetail();
      setNotice(messageFor(result, 'confirm saving this contact'), 'error', result?.status === 'conflict' && target
        ? { label: 'Reload saved contact', run: () => void selectContact(target.id, { preserveDraft: true }) }
        : writeUncertain ? { label: 'Refresh contacts', run: () => void loadList(0) } : undefined);
    }
  }
  function renderEditorBusy() { renderDetail(); updateSave(); }
  async function removeContact() {
    if (!selected || busy || writeUncertain) return;
    const target = selected; busy = true; addButton.disabled = true; setNotice(); renderDetail();
    const controller = mutationController = new AbortController();
    let result; try { result = await client.delete({ contactId: target.id, expectedUpdatedAt: target.updated_at, signal: controller.signal }); } catch { result = { status: 'unavailable', reason: 'write_outcome_unknown' }; }
    if (disposed) return; busy = false; addButton.disabled = false;
    if (result?.status === 'ready' && result.contactWrite?.operation === 'deleted') {
      selected = null; requestedId = null; confirmDelete = false; setView('list'); renderDetail(); setNotice('Contact deleted.', 'success'); void loadList(0);
    } else {
      writeUncertain = result?.reason === 'write_outcome_unknown'; renderDetail(); setNotice(messageFor(result, 'confirm deleting this contact'), 'error',
        result?.status === 'conflict' || result?.status === 'not_found'
          ? { label: 'Reload saved contact', run: () => void selectContact(target.id) }
          : writeUncertain ? { label: 'Refresh contacts', run: () => void loadList(0) } : undefined);
    }
  }
  function open() {
    if (!entered || disposed) return;
    const activeModal = document.querySelector('dialog[open]');
    if (activeModal && activeModal !== panel) return;
    if (closing) { clearTimeout(closeTimer); closing = false; panel.classList.remove('is-closing'); }
    else {
      if (panel.open) return;
      previousFocus = document.activeElement; panel.hidden = false; panel.showModal(); launcher.setAttribute('aria-expanded', 'true');
    }
    if (listLoading || !contacts.length && !listError) void loadList(0);
    if (mode === 'create' || mode === 'edit') detail.querySelector('input,textarea')?.focus(); else search.focus();
  }
  function finishClose() {
    clearTimeout(closeTimer); closing = false; panel.classList.remove('is-closing');
    if (panel.open) panel.close();
    panel.hidden = true; launcher.setAttribute('aria-expanded', 'false');
    if (entered && !disposed) (previousFocus?.isConnected && typeof previousFocus.focus === 'function' ? previousFocus : launcher).focus();
    previousFocus = null;
  }
  function close({ immediate = false } = {}) {
    if (!panel.open) { if (immediate) finishClose(); return; }
    if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) { finishClose(); return; }
    if (closing) return;
    closing = true; panel.classList.add('is-closing'); closeTimer = setTimeout(finishClose, 180);
  }
  function onEnter() { if (disposed) return; entered = true; root.hidden = false; launcher.hidden = false; }
  function onFailure() { entered = false; close({ immediate: true }); root.hidden = true; launcher.hidden = true; listController?.abort(); detailController?.abort(); }
  function preventMap(event) { event.stopPropagation(); }
  for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'click', 'dblclick', 'touchstart', 'touchmove', 'touchend', 'keyup']) root.addEventListener(event, preventMap);
  launcher.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key?.toLowerCase() === 'k') return;
    event.stopPropagation();
  });
  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape' && !filterPanel.hidden) { event.preventDefault(); setFiltersOpen(false, true); }
    if ((event.metaKey || event.ctrlKey) && event.key?.toLowerCase() === 'k') event.preventDefault();
  });
  panel.addEventListener('cancel', event => { event.preventDefault(); if (!filterPanel.hidden) setFiltersOpen(false, true); else close(); });
  panel.addEventListener('click', event => { if (event.target !== panel) return; const rect = panel.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); });
  search.addEventListener('input', () => { clearTimeout(searchTimer); query = search.value; searchTimer = setTimeout(() => void loadList(0), 220); });
  document.addEventListener('campus-enter', onEnter); document.addEventListener('campus-loading-failed', onFailure);
  renderList(); renderDetail(); setView(mobileView);
  return Object.freeze({ launcher, open, close, dispose() {
    if (disposed) return; disposed = true; close({ immediate: true }); clearTimeout(searchTimer); listController?.abort(); detailController?.abort(); mutationController?.abort();
    document.removeEventListener('campus-enter', onEnter); document.removeEventListener('campus-loading-failed', onFailure); launcher.remove(); root.remove();
    contacts = []; selected = null; draft = emptyFields(); baseline = emptyFields();
  } });
}
