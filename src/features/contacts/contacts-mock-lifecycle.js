export function installContactsMockLifecycle(view) {
  view.open = function open() {
    if (!view.entered || view.disposed) return;
    const activeModal = document.querySelector('dialog[open]');
    if (activeModal && activeModal !== view.panel) return;
    if (view.closing) {
      clearTimeout(view.closeTimer);
      view.closing = false;
      view.panel.classList.remove('is-closing');
    } else {
      if (view.panel.open) return;
      view.previousFocus = document.activeElement;
      view.panel.hidden = false;
      view.panel.showModal();
      view.launcher.setAttribute('aria-expanded', 'true');
    }
    if (view.listLoading || (!view.contacts.length && !view.listError)) void view.loadList(0);
    if (view.mode === 'create' || view.mode === 'edit')
      view.detail.querySelector('input,textarea')?.focus();
    else view.search.focus();
  };
  view.finishClose = function finishClose() {
    clearTimeout(view.closeTimer);
    view.closing = false;
    view.panel.classList.remove('is-closing');
    if (view.panel.open) view.panel.close();
    view.panel.hidden = true;
    view.launcher.setAttribute('aria-expanded', 'false');
    if (view.entered && !view.disposed)
      (view.previousFocus?.isConnected && typeof view.previousFocus.focus === 'function'
        ? view.previousFocus
        : view.launcher
      ).focus();
    view.previousFocus = null;
  };
  view.close = function close({ immediate = false } = {}) {
    if (!view.panel.open) {
      if (immediate) view.finishClose();
      return;
    }
    if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      view.finishClose();
      return;
    }
    if (view.closing) return;
    view.closing = true;
    view.panel.classList.add('is-closing');
    view.closeTimer = setTimeout(view.finishClose, 180);
  };
  view.onEnter = function onEnter() {
    if (view.disposed) return;
    view.entered = true;
    view.root.hidden = false;
    view.launcher.hidden = false;
  };
  view.onFailure = function onFailure() {
    view.entered = false;
    view.close({ immediate: true });
    view.root.hidden = true;
    view.launcher.hidden = true;
    view.listController?.abort();
    view.detailController?.abort();
  };
  view.preventMap = function preventMap(event) {
    event.stopPropagation();
  };
}
