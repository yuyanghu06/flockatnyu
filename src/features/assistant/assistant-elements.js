import { ATTACHMENT_ACCEPT } from './chat-attachments.js';

import { assistantShortcut } from './assistant-presentation.js';
import { assistantLogoUrl, assistantHoverLogoUrl } from './assistant-helpers.js';

export function initializeAssistant(view) {
  view.entered = false;
  view.disposed = false;
  view.available = false;
  view.busy = false;
  view.draftAttachments = [];
  view.readingFiles = false;
  view.draftContactContext = undefined;
  view.maxPendingMessages = 10;
  view.maxPendingAttachmentBytes = 20 * 1024 * 1024;
  view.queuedMessages = [];
  view.queuePaused = false;
  view.activeMessage = null;
  view.nextMessageId = 0;
  view.activeRun = null;
  view.pendingInjection = null;
  view.conversation = [];
  view.request = undefined;
  view.statusRequest = undefined;
  view.generation = 0;
  view.previousFocus = undefined;
  view.replyRender = undefined;
  view.closing = false;
  view.closeTimer = undefined;
  view.resizeAnimation = undefined;
  view.resizeFrame = 0;
  view.resizeFrom = undefined;
  view.followFrame = 0;
  view.pendingScroll = false;
  view.building = view.getBuilding();
  view.el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  view.logo = () => {
    const image = view.el('img', 'assistant-logo');
    image.src = assistantLogoUrl;
    image.alt = '';
    image.width = image.height = 28;
    return image;
  };
  view.root = view.el('div', 'campus-assistant');
  view.root.hidden = true;
  view.launcher = view.el('button', 'assistant-launcher');
  view.launcher.type = 'button';
  view.launcher.setAttribute('aria-label', 'Open campus assistant');
  view.launcher.setAttribute('aria-expanded', 'false');
  view.launcher.setAttribute('aria-controls', 'campus-assistant-panel');
  view.keyboard = assistantShortcut(globalThis.navigator);
  if (!view.keyboard.mobile) view.launcher.setAttribute('aria-keyshortcuts', view.keyboard.key);
  view.shortcut = view.el('kbd', 'assistant-shortcut', view.keyboard.label);
  view.shortcut.hidden = view.keyboard.mobile;
  view.launcherLogo = view.el('span', 'assistant-logo assistant-launcher-logo');
  view.launcherLogo.setAttribute('aria-hidden', 'true');
  view.launcherLogo.append(view.logo());
  view.animatedLogo = undefined;
  view.stopLogoAnimation = () => {
    view.animatedLogo?.remove();
    view.animatedLogo = null;
    view.launcherLogo.classList.remove('is-animated');
  };
  view.startLogoAnimation = () => {
    if (view.animatedLogo || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const image = view.logo();
    image.classList.add('assistant-logo-motion');
    image.addEventListener(
      'load',
      () => {
        if (view.animatedLogo === image) view.launcherLogo.classList.add('is-animated');
      },
      { once: true },
    );
    image.addEventListener('error', view.stopLogoAnimation, { once: true });
    view.animatedLogo = image;
    image.src = assistantHoverLogoUrl;
    view.launcherLogo.append(image);
  };
  view.launcher.addEventListener('pointerenter', view.startLogoAnimation);
  view.launcher.addEventListener('pointerleave', view.stopLogoAnimation);
  view.launcher.addEventListener('focus', view.startLogoAnimation);
  view.launcher.addEventListener('blur', view.stopLogoAnimation);
  view.launcher.append(view.launcherLogo, view.el('span', '', 'Ask Tech@NYU'), view.shortcut);
  view.panel = view.el('dialog', 'assistant-panel');
  view.panel.id = 'campus-assistant-panel';
  view.panel.hidden = true;
  view.panel.setAttribute('aria-label', 'Campus assistant');
  view.header = view.el('header', 'assistant-header');
  view.identity = view.el('div', 'assistant-identity');
  view.identity.append(view.logo(), view.el('span', '', 'Flock@NYU'));
  view.closeButton = view.el('button', 'assistant-icon-button', '×');
  view.closeButton.type = 'button';
  view.closeButton.setAttribute('aria-label', 'Close assistant');
  view.headerActions = view.el('div', 'assistant-header-actions');
  view.headerActions.append(view.closeButton);
  view.header.append(view.identity, view.headerActions);
  view.form = view.el('form', 'assistant-form');
  view.label = view.el('label', 'assistant-input-label', 'Message');
  view.input = view.el('textarea');
  view.input.id = 'campus-assistant-message';
  view.label.htmlFor = view.input.id;
  view.input.rows = 1;
  view.input.maxLength = 8000;
  view.input.placeholder = 'Ask about Tech@NYU…';
  view.compose = view.el('div', 'assistant-compose');
  view.send = view.el('button', 'assistant-send', '↑');
  view.send.type = 'submit';
  view.send.setAttribute('aria-label', 'Send message');
  view.attach = view.el('button', 'assistant-attach');
  view.attach.type = 'button';
  view.attach.setAttribute('aria-label', 'Attach files');
  view.attach.title =
    'Attach PNG, JPEG, WebP, PDF, or UTF-8 text/code · up to 4 files · 5 MiB each (text 128 KiB)';
  view.attach.innerHTML =
    '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9"/><path d="m6 14 8-8"/></svg>';
  view.fileInput = view.el('input');
  view.fileInput.type = 'file';
  view.fileInput.multiple = true;
  view.fileInput.accept = ATTACHMENT_ACCEPT;
  view.fileInput.hidden = true;
  view.fileInput.setAttribute('aria-label', 'Choose files to attach');
  view.contactContextArea = view.el('div', 'assistant-contact-context');
  view.contactContextArea.hidden = true;
  view.contactContextArea.setAttribute('aria-label', 'Selected contact');
  view.draftFiles = view.el('div', 'assistant-attachments');
  view.draftFiles.hidden = true;
  view.draftFiles.setAttribute('aria-label', 'Attached files');
  view.attachmentError = view.el('p', 'assistant-attachment-error');
  view.attachmentError.hidden = true;
  view.attachmentError.setAttribute('role', 'alert');
  view.queue = view.el('section', 'assistant-queue');
  view.queue.hidden = true;
  view.queue.setAttribute('aria-label', 'Message queue');
  view.queueHeader = view.el('div', 'assistant-queue-header');
  view.queueState = view.el('p', 'assistant-queue-state');
  view.queueState.setAttribute('role', 'status');
  view.resumeQueue = view.el('button', 'assistant-queue-action', 'Resume');
  view.resumeQueue.type = 'button';
  view.resumeQueue.hidden = true;
  view.resumeQueue.setAttribute('aria-label', 'Resume queued messages');
  view.clearQueue = view.el('button', 'assistant-queue-action assistant-queue-clear', 'Clear');
  view.clearQueue.type = 'button';
  view.clearQueue.setAttribute('aria-label', 'Clear queued messages');
  view.queueHeader.append(view.queueState, view.resumeQueue, view.clearQueue);
  view.queueList = view.el('ol', 'assistant-queue-list');
  view.queueList.setAttribute('aria-label', 'Queued messages');
  view.queue.append(view.queueHeader, view.queueList);
  view.prompt = view.el('div', 'assistant-prompt');
  view.prompt.append(view.contactContextArea, view.input);
  view.compose.append(view.attach, view.prompt, view.send);
  view.form.append(
    view.queue,
    view.label,
    view.compose,
    view.fileInput,
    view.draftFiles,
    view.attachmentError,
  );
  view.connection = view.el('div', 'assistant-connection');
  view.service = view.el('p', 'assistant-service', 'Checking connection…');
  view.service.setAttribute('role', 'status');
  view.retry = view.el('button', 'assistant-retry', 'Retry');
  view.retry.type = 'button';
  view.retry.hidden = true;
  view.connection.hidden = true;
  view.connection.append(view.service, view.retry);
  view.form.append(view.connection);
  view.transcript = view.el('div', 'assistant-transcript');
  view.transcript.hidden = true;
  view.transcript.setAttribute('role', 'log');
  view.transcript.setAttribute('aria-label', 'Conversation');
  view.transcript.setAttribute('aria-live', 'off');
  view.announcement = view.el('p', 'assistant-announcement');
  view.announcement.setAttribute('role', 'status');
  view.announcement.setAttribute('aria-live', 'polite');
  view.panel.append(view.header, view.transcript, view.form, view.announcement);
  if (Array.isArray(view.extraLaunchers) && view.extraLaunchers.length) {
    const launchers = view.el('div', 'assistant-launchers');
    launchers.append(...view.extraLaunchers, view.launcher);
    view.root.append(launchers, view.panel);
  } else view.root.append(view.launcher, view.panel);
  view.container.append(view.root);
}
