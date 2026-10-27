import {
  CONTACT_FIELD_LIMITS,
  labels,
  keys,
  emptyFields,
  nameOf,
  initialsOf,
  el,
  button,
  icon,
  messageFor,
} from './contacts-mock-helpers.js';

export function installContactsMockDetail(view) {
  view.detailBase = function detailBase() {
    view.detail.replaceChildren();
    view.detail.append(view.backButton());
    const notice = el('div', 'contacts-notice');
    notice.hidden = true;
    view.detail.append(notice);
  };
  view.renderDetail = function renderDetail() {
    view.detailBase();
    if (view.detailLoading) {
      view.detail.append(el('p', 'contacts-detail-state', 'Loading contact…'));
      return;
    }
    if (view.detailError) {
      view.detail.append(
        el('h3', 'contacts-detail-title', 'Contact unavailable'),
        el('p', 'contacts-detail-state', messageFor(view.detailError)),
        button(
          'contacts-text-button',
          'Retry',
          () =>
            void view.selectContact(view.requestedId, { preserveDraft: view.preserveDraftOnRetry }),
        ),
      );
      return;
    }
    if (view.mode === 'create') {
      view.renderEditor();
      view.renderNotice();
      return;
    }
    if (!view.selected) {
      const empty = el('div', 'contacts-welcome');
      empty.append(
        icon(),
        el('h3', '', 'A place for your people'),
        el('p', '', 'Choose a contact to see their details, or add someone new.'),
      );
      view.detail.append(empty);
      view.renderNotice();
      return;
    }
    const intro = el('div', 'contacts-profile'),
      identity = el('div', 'contacts-profile-identity');
    identity.append(el('h3', 'contacts-detail-title', nameOf(view.selected)));
    if (view.selected.fields.workplace)
      identity.append(el('p', 'contacts-profile-workplace', view.selected.fields.workplace));
    intro.append(
      el('span', 'contacts-avatar contacts-avatar--large', initialsOf(view.selected)),
      identity,
    );
    const actions = el('div', 'contacts-detail-actions');
    const remove = button('contacts-delete', '×', () => {
      view.confirmDelete = true;
      view.setNotice();
      view.renderDetail();
    });
    remove.setAttribute('aria-label', 'Delete contact');
    remove.title = 'Delete contact';
    remove.disabled = view.busy;
    actions.append(remove);
    intro.append(actions);
    view.detail.append(intro);
    if (view.confirmDelete) {
      const confirmation = el('div', 'contacts-delete-confirmation');
      confirmation.setAttribute('role', 'group');
      confirmation.setAttribute('aria-label', 'Confirm contact deletion');
      confirmation.append(
        el('strong', '', `Delete ${nameOf(view.selected)}?`),
        el('p', '', 'This removes their saved contact details.'),
      );
      const actions = el('div', 'contacts-inline-actions');
      const remove = button(
        'contacts-button contacts-button--danger',
        view.busy ? 'Deleting…' : 'Delete contact',
        () => void view.removeContact(),
      );
      remove.disabled = view.busy || view.writeUncertain;
      const cancel = button('contacts-text-button', 'Cancel', () => {
        view.confirmDelete = false;
        view.setNotice();
        view.renderDetail();
      });
      cancel.disabled = view.busy;
      actions.append(remove, cancel);
      confirmation.append(actions);
      view.detail.append(confirmation);
    }
    view.renderEditor({ inline: true });
    view.renderNotice();
  };
  view.beginCreate = function beginCreate() {
    view.detailController?.abort();
    view.detailGeneration++;
    view.selected = null;
    view.requestedId = null;
    view.detailLoading = false;
    view.detailError = null;
    view.draft = emptyFields();
    view.baseline = emptyFields();
    view.mode = 'create';
    view.confirmDelete = false;
    view.writeUncertain = false;
    view.noticeText = '';
    view.noticeAction = undefined;
    view.setView('detail');
    view.renderList();
    view.renderDetail();
    view.detail.querySelector('input')?.focus();
  };
  view.renderEditor = function renderEditor({ inline = false } = {}) {
    if (!inline)
      view.detail.append(
        el('h3', 'contacts-detail-title', 'New contact'),
        el('p', 'contacts-editor-help', 'Keep what you know. You can fill in the rest later.'),
      );
    const form = el('form', `contacts-editor${inline ? ' contacts-editor--inline' : ''}`);
    form.noValidate = true;
    form.autocomplete = 'off';
    const grid = el('div', 'contacts-editor-grid');
    for (const key of keys) {
      const group = el(
          'div',
          `contacts-input-group${key === 'notes' ? ' contacts-input-group--wide' : ''}`,
        ),
        label = el('label', '', labels[key]);
      const input = el(key === 'notes' ? 'textarea' : 'input');
      input.id = `contacts-${key}`;
      input.name = key;
      label.htmlFor = input.id;
      input.maxLength = CONTACT_FIELD_LIMITS[key];
      input.value = view.draft[key];
      input.disabled = view.busy;
      input.autocomplete = 'off';
      if (key === 'notes') {
        input.rows = 4;
        input.placeholder = 'How you met, what to follow up on…';
      } else {
        input.type = 'text';
        if (key === 'email') input.inputMode = 'email';
        if (key === 'phone_number') input.inputMode = 'tel';
      }
      input.addEventListener('input', () => {
        view.draft[key] = input.value;
        view.updateSave();
      });
      group.append(label, input);
      grid.append(group);
    }
    const footer = el('div', 'contacts-editor-footer'),
      save = button(
        'contacts-button contacts-button--primary',
        view.busy ? 'Saving…' : 'Save contact',
      );
    save.type = 'submit';
    save.dataset.action = 'save';
    const cancel = button('contacts-text-button', 'Cancel', () => {
      if (view.busy) return;
      view.draft = { ...view.baseline };
      view.mode = 'detail';
      view.writeUncertain = false;
      view.pendingNavigation = undefined;
      view.setNotice();
      if (!view.selected) view.setView('list');
      view.renderDetail();
    });
    cancel.disabled = view.busy;
    footer.append(cancel, save);
    form.append(grid, footer);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void view.saveContact();
    });
    view.detail.append(form);
    view.updateSave();
  };
  view.updateSave = function updateSave() {
    const save = view.detail.querySelector('[data-action="save"]');
    if (save)
      save.disabled =
        view.busy ||
        view.writeUncertain ||
        !view.dirty() ||
        (view.mode === 'create' && !keys.some((key) => view.draft[key].trim()));
    const footer = view.detail.querySelector('.contacts-editor-footer');
    if (footer) footer.hidden = view.mode !== 'create' && !view.dirty();
    view.addButton.disabled = view.busy;
  };
  view.renderEditorBusy = function renderEditorBusy() {
    view.renderDetail();
    view.updateSave();
  };
}
