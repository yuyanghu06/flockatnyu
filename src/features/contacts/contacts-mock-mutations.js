import { keys, messageFor } from './contacts-mock-helpers.js';

export function installContactsMockMutations(view) {
  view.selectContact = async function selectContact(id, { preserveDraft = false } = {}) {
    if (!id || view.busy) return;
    const generation = ++view.detailGeneration,
      changes = preserveDraft ? view.changedFields() : null;
    view.preserveDraftOnRetry = preserveDraft;
    view.detailController?.abort();
    const controller = (view.detailController = new AbortController());
    view.requestedId = id;
    view.detailLoading = true;
    view.detailError = null;
    if (!preserveDraft) {
      view.mode = 'detail';
      view.selected = null;
      view.noticeText = '';
      view.noticeAction = undefined;
      view.writeUncertain = false;
    }
    view.confirmDelete = false;
    view.setView('detail');
    view.renderList();
    view.renderDetail();
    let result;
    try {
      result = await view.client.read({ contactId: id, signal: controller.signal });
    } catch {
      result = { status: 'unavailable' };
    }
    if (view.disposed || generation !== view.detailGeneration || controller.signal.aborted) return;
    view.detailLoading = false;
    if (result?.status === 'ready') {
      view.selected = result.contact;
      if (preserveDraft) {
        view.baseline = { ...view.selected.fields };
        view.draft = { ...view.baseline, ...changes };
        view.mode = 'edit';
        view.writeUncertain = false;
        view.noticeText =
          'Loaded the latest contact. Your changes are still here; review them before saving.';
        view.noticeKind = 'info';
        view.noticeAction = undefined;
      } else {
        view.baseline = { ...view.selected.fields };
        view.draft = { ...view.selected.fields };
      }
    } else {
      view.detailError = result;
    }
    view.renderList();
    view.renderDetail();
  };
  view.saveContact = async function saveContact() {
    if (
      view.busy ||
      view.writeUncertain ||
      !view.dirty() ||
      (view.mode === 'create' && !keys.some((key) => view.draft[key].trim()))
    )
      return;
    const creating = view.mode === 'create',
      fields = creating ? { ...view.draft } : view.changedFields(),
      target = view.selected;
    view.busy = true;
    view.pendingNavigation = undefined;
    view.setNotice();
    view.renderEditorBusy();
    const controller = (view.mutationController = new AbortController());
    let result;
    try {
      result = creating
        ? await view.client.create({ fields, signal: controller.signal })
        : await view.client.update({
            contactId: target.id,
            expectedUpdatedAt: target.updated_at,
            fields,
            signal: controller.signal,
          });
    } catch {
      result = { status: 'unavailable', reason: 'write_outcome_unknown' };
    }
    if (view.disposed) return;
    view.busy = false;
    view.addButton.disabled = false;
    if (result?.status === 'ready' && result.contactWrite && result.contact) {
      view.selected = result.contact;
      view.mode = 'detail';
      view.draft = { ...view.selected.fields };
      view.baseline = { ...view.selected.fields };
      view.renderDetail();
      view.setNotice(creating ? 'Contact added.' : 'Changes saved.', 'success');
      void view.loadList(0);
    } else {
      view.writeUncertain = result?.reason === 'write_outcome_unknown';
      view.renderDetail();
      view.setNotice(
        messageFor(result, 'confirm saving this contact'),
        'error',
        result?.status === 'conflict' && target
          ? {
              label: 'Reload saved contact',
              run: () => void view.selectContact(target.id, { preserveDraft: true }),
            }
          : view.writeUncertain
            ? { label: 'Refresh contacts', run: () => void view.loadList(0) }
            : undefined,
      );
    }
  };
  view.removeContact = async function removeContact() {
    if (!view.selected || view.busy || view.writeUncertain) return;
    const target = view.selected;
    view.busy = true;
    view.addButton.disabled = true;
    view.setNotice();
    view.renderDetail();
    const controller = (view.mutationController = new AbortController());
    let result;
    try {
      result = await view.client.delete({
        contactId: target.id,
        expectedUpdatedAt: target.updated_at,
        signal: controller.signal,
      });
    } catch {
      result = { status: 'unavailable', reason: 'write_outcome_unknown' };
    }
    if (view.disposed) return;
    view.busy = false;
    view.addButton.disabled = false;
    if (result?.status === 'ready' && result.contactWrite?.operation === 'deleted') {
      view.selected = null;
      view.requestedId = null;
      view.confirmDelete = false;
      view.setView('list');
      view.renderDetail();
      view.setNotice('Contact deleted.', 'success');
      void view.loadList(0);
    } else {
      view.writeUncertain = result?.reason === 'write_outcome_unknown';
      view.renderDetail();
      view.setNotice(
        messageFor(result, 'confirm deleting this contact'),
        'error',
        result?.status === 'conflict' || result?.status === 'not_found'
          ? { label: 'Reload saved contact', run: () => void view.selectContact(target.id) }
          : view.writeUncertain
            ? { label: 'Refresh contacts', run: () => void view.loadList(0) }
            : undefined,
      );
    }
  };
}
