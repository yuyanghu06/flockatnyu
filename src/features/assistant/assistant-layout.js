import { getAssistantStatus } from './chat-client.js';

export function installAssistantLayout(view) {
  view.pauseFollow = function pauseFollow() {
    if (view.followFrame) cancelAnimationFrame(view.followFrame);
    view.followFrame = 0;
  };
  view.followLatest = function followLatest() {
    view.transcript.scrollTop = view.transcript.scrollHeight;
    if (view.followFrame || typeof requestAnimationFrame !== 'function') return;
    const follow = () => {
      view.followFrame = 0;
      if (!view.panel.open || view.closing || view.disposed) return;
      view.transcript.scrollTop = view.transcript.scrollHeight;
      if (view.resizeFrame || view.resizeAnimation?.playState === 'running')
        view.followFrame = requestAnimationFrame(follow);
    };
    view.followFrame = requestAnimationFrame(follow);
  };
  view.queueResize = function queueResize(fromHeight, follow = false) {
    // A height tween may shrink the transcript, but must always fit the footer.
    if (view.panel.open)
      view.panel.style.minHeight = `min(${Math.ceil(view.header.getBoundingClientRect().height + view.form.getBoundingClientRect().height)}px, var(--assistant-max-height))`;
    if (follow) {
      if (!view.panel.open || view.closing) view.pendingScroll = true;
      else view.followLatest();
    }
    if (
      !view.panel.open ||
      view.closing ||
      typeof view.panel.animate !== 'function' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    if (view.resizeFrame) return;
    view.resizeFrom = fromHeight;
    view.resizeFrame = requestAnimationFrame(() => {
      view.resizeFrame = 0;
      if (!view.panel.open || view.closing) return;
      view.resizeAnimation?.cancel();
      const target = view.panel.getBoundingClientRect().height;
      if (Math.abs(target - view.resizeFrom) < 0.5) return;
      view.resizeAnimation = view.panel.animate(
        [{ height: `${view.resizeFrom}px` }, { height: `${target}px` }],
        {
          duration: 280,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        },
      );
    });
  };
  view.resizeInput = function resizeInput() {
    const height = view.panel.getBoundingClientRect().height;
    const follow = view.atLatest();
    view.input.style.height = 'auto';
    view.input.style.height = Math.min(view.input.scrollHeight || 34, 132) + 'px';
    view.queueResize(height, follow);
  };
  view.controls = function controls() {
    // Drafting remains possible while configuration or the network is unavailable.
    view.input.disabled = !view.entered;
    view.attach.disabled = !view.entered || view.readingFiles;
    view.send.disabled =
      !view.entered ||
      (!view.busy &&
        (!view.available ||
          view.readingFiles ||
          (!view.input.value.trim() && !view.draftAttachments.length)));
    const willQueue = view.busy || view.queuePaused || view.queuedMessages.length > 0;
    view.send.type = view.busy ? 'button' : 'submit';
    view.send.textContent = view.busy ? '■' : '↑';
    view.send.className = view.busy ? 'assistant-send is-stopping' : 'assistant-send';
    view.send.setAttribute(
      'aria-label',
      view.busy ? 'Stop generating' : willQueue ? 'Queue message' : 'Send message',
    );
    view.send.title = view.busy
      ? 'Stop this reply and pause queued messages'
      : willQueue
        ? 'Add this message to the queue'
        : 'Send message';
    view.resumeQueue.disabled =
      !view.entered || !view.available || view.busy || Boolean(view.pendingInjection);
    view.clearQueue.disabled = Boolean(view.pendingInjection);
    // The composer stays usable while the transcript is being updated.
    view.transcript.setAttribute('aria-busy', String(view.busy));
  };
  view.open = function open() {
    if (!view.entered || view.disposed) return;
    const activeModal = document.querySelector?.('dialog[open]');
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
    view.resizeInput();
    if (view.pendingScroll) {
      view.pendingScroll = false;
      view.followLatest();
    }
    view.input.focus();
  };
  view.finishClose = function finishClose() {
    if (view.resizeFrame) cancelAnimationFrame(view.resizeFrame);
    if (view.followFrame) cancelAnimationFrame(view.followFrame);
    view.followFrame = 0;
    view.resizeFrame = 0;
    view.resizeAnimation?.cancel();
    clearTimeout(view.closeTimer);
    view.closing = false;
    view.panel.classList.remove('is-closing');
    view.panel.close();
    view.panel.hidden = true;
    view.launcher.setAttribute('aria-expanded', 'false');
    if (view.entered)
      (view.previousFocus?.isConnected && typeof view.previousFocus.focus === 'function'
        ? view.previousFocus
        : view.launcher
      ).focus();
    view.previousFocus = null;
  };
  view.close = function close({ immediate = false } = {}) {
    if (!view.panel.open) return;
    // Dismiss the panel without interrupting the active response.
    if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      view.finishClose();
      return;
    }
    if (view.closing) return;
    view.closing = true;
    view.panel.classList.add('is-closing');
    view.closeTimer = setTimeout(view.finishClose, 180);
  };
  view.status = async function status() {
    view.statusRequest?.abort();
    const controller = new AbortController();
    view.statusRequest = controller;
    view.available = false;
    view.controls();
    view.service.textContent = 'Checking connection…';
    view.service.setAttribute('data-connected', 'false');
    view.retry.hidden = true;
    view.connection.hidden = true;
    try {
      const data = await getAssistantStatus({ signal: controller.signal });
      if (view.disposed || !view.entered || view.statusRequest !== controller) return;
      view.available = data.chat.configured && data.access.allowed;
      view.service.textContent = !data.access.allowed
        ? 'Session access required'
        : !data.chat.configured
          ? 'Assistant setup pending'
          : data.discord?.liveConfigured && data.discord?.liveAllowed
            ? 'Ready to ask · live Discord'
            : data.google?.configured && data.google?.allowed
              ? 'Ready to ask · Google'
              : data.miro?.configured
                ? 'Ready to ask · Miro'
                : 'Ready to ask · club sources unavailable';
      view.service.title = !data.access.allowed
        ? 'Assistant access is not available for this session.'
        : !data.chat.configured
          ? 'The assistant has not been configured on the server.'
          : '';
      view.service.setAttribute('data-connected', String(view.available));
      view.retry.hidden = view.available;
      view.connection.hidden = view.available;
    } catch (error) {
      if (
        error.name !== 'AbortError' &&
        view.statusRequest === controller &&
        view.entered &&
        !view.disposed
      ) {
        view.service.textContent = 'Assistant offline';
        view.service.title = error.message;
        view.service.setAttribute('data-connected', 'false');
        view.retry.hidden = false;
        view.connection.hidden = false;
      }
    } finally {
      if (view.statusRequest === controller) {
        view.controls();
        view.drainQueue();
      }
    }
  };
  view.onViewportResize = function onViewportResize() {
    if (!view.panel.open || view.closing || view.disposed) return;
    view.resizeAnimation?.cancel();
    view.resizeInput();
  };
}
