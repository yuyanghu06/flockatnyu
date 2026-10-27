import { installAssistantLayout } from './assistant-layout.js';
import { installAssistantQueue } from './assistant-queue.js';
import { installAssistantComposer } from './assistant-composer.js';
import { installAssistantResponse } from './assistant-response.js';
import { initializeAssistant } from './assistant-elements.js';
export function createAssistant({
  container = document.body,
  getBuilding = () => null,
  extraLaunchers = [],
} = {}) {
  const view = { container, getBuilding, extraLaunchers };
  installAssistantLayout(view);
  installAssistantQueue(view);
  installAssistantComposer(view);
  installAssistantResponse(view);
  initializeAssistant(view);
  view.atLatest = () =>
    view.transcript.scrollHeight - view.transcript.clientHeight - view.transcript.scrollTop < 2;
  view.transcript.addEventListener(
    'wheel',
    (event) => {
      if (event.deltaY < 0) view.pauseFollow();
    },
    { passive: true },
  );
  view.transcript.addEventListener('pointerdown', view.pauseFollow);
  view.onEnter = function onEnter() {
    if (view.entered || view.disposed) return;
    view.entered = true;
    view.root.hidden = false;
    view.controls();
    void view.status();
  };
  view.onFailure = function onFailure() {
    view.entered = false;
    if (!view.disposed && view.activeMessage)
      view.queuedMessages.unshift({ ...view.activeMessage, retry: true });
    view.queuePaused = view.queuedMessages.length > 0;
    view.abort();
    view.renderQueue();
    view.statusRequest?.abort();
    view.available = false;
    view.close({ immediate: true });
    view.root.hidden = true;
    view.panel.hidden = true;
    view.launcher.setAttribute('aria-expanded', 'false');
  };
  view.onBuilding = function onBuilding(event) {
    view.building = event.detail?.id
      ? { id: event.detail.id, name: event.detail.name || event.detail.id }
      : null;
  };
  view.preventMap = function preventMap(event) {
    event.stopPropagation();
  };
  view.onShortcut = function onShortcut(event) {
    if (
      !view.entered ||
      view.disposed ||
      view.keyboard.mobile ||
      event.defaultPrevented ||
      event.isComposing ||
      event.repeat ||
      event.altKey ||
      event.shiftKey ||
      !event[view.keyboard.modifier] ||
      event.key?.toLowerCase() !== 'k'
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    view.panel.open ? view.close() : view.open();
  };
  [
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
  ].forEach((name) => view.root.addEventListener(name, view.preventMap));
  view.root.addEventListener('keydown', (event) => {
    view.onShortcut(event);
    event.stopPropagation();
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      view.close();
    }
  });
  view.root.addEventListener('keyup', view.preventMap);
  view.attach.addEventListener('click', () => view.fileInput.click());
  view.fileInput.addEventListener('change', () => view.addFiles(view.fileInput.files));
  view.input.addEventListener('paste', (event) => {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length) {
      event.preventDefault();
      void view.addFiles(files);
    }
  });
  view.panel.addEventListener('dragover', (event) => {
    if (Array.from(event.dataTransfer?.types || []).includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  view.panel.addEventListener('drop', (event) => {
    if (event.dataTransfer?.files?.length) {
      event.preventDefault();
      event.stopPropagation();
      void view.addFiles(event.dataTransfer.files);
    }
  });
  view.input.addEventListener('input', () => {
    view.resizeInput();
    view.controls();
  });
  view.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!event.repeat) view.form.requestSubmit();
    }
  });
  view.panel.addEventListener('cancel', (event) => {
    event.preventDefault();
    view.close();
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
  view.launcher.addEventListener('click', () => (view.panel.open ? view.close() : view.open()));
  view.closeButton.addEventListener('click', view.close);
  view.retry.addEventListener('click', () => void view.status());
  view.form.addEventListener('submit', view.submit);
  view.send.addEventListener('click', (event) => {
    if (view.busy) {
      event.preventDefault();
      view.stopRequest();
    }
  });
  view.resumeQueue.addEventListener('click', () => {
    if (view.busy || view.pendingInjection || !view.available || !view.entered || view.disposed)
      return;
    view.queuePaused = false;
    view.renderQueue();
    view.controls();
    return view.drainQueue();
  });
  view.clearQueue.addEventListener('click', () => {
    if (view.pendingInjection) return;
    view.queuedMessages = [];
    view.queuePaused = false;
    view.renderQueue();
    view.controls();
    view.input.focus();
  });
  document.addEventListener('keydown', view.onShortcut);
  globalThis.addEventListener?.('resize', view.onViewportResize);
  globalThis.visualViewport?.addEventListener('resize', view.onViewportResize);
  document.addEventListener('campus-enter', view.onEnter);
  document.addEventListener('campus-loading-failed', view.onFailure);
  document.addEventListener('campus-building-selected', view.onBuilding);
  view.controls();
  return Object.freeze({
    open: view.open,
    close: view.close,
    attachContact: view.attachContact,
    dispose() {
      view.stopLogoAnimation();
      view.disposed = true;
      view.draftAttachments = [];
      view.draftContactContext = undefined;
      view.conversation = [];
      view.queuedMessages = [];
      view.activeMessage = null;
      view.onFailure();
      document.removeEventListener('keydown', view.onShortcut);
      globalThis.removeEventListener?.('resize', view.onViewportResize);
      globalThis.visualViewport?.removeEventListener('resize', view.onViewportResize);
      document.removeEventListener('campus-enter', view.onEnter);
      document.removeEventListener('campus-loading-failed', view.onFailure);
      document.removeEventListener('campus-building-selected', view.onBuilding);
      view.root.remove();
    },
  });
}
