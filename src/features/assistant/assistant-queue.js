import { ATTACHMENT_ONLY_CONTENT } from './chat-attachments.js';
import { boundedMessages, steerAssistant } from './chat-client.js';

export function installAssistantQueue(view) {
  view.injectionUnavailable = function injectionUnavailable(message) {
    if (
      !view.entered ||
      !view.available ||
      !view.busy ||
      !view.activeRun ||
      view.request?.signal.aborted
    )
      return 'Wait for an active reply before adding queued text.';
    if (view.pendingInjection) return 'Wait for the current queued message to be incorporated.';
    if (message.requestGroupBound && message.requestId !== view.activeMessage?.requestId)
      return 'Resume this message separately to retain its original request.';
    if (message.attachments.length) return 'Messages with files must be sent as a separate reply.';
    if (message.steeredMessages?.length)
      return 'Resume this interrupted reply to retain all of its added messages.';
    if (!message.text.trim()) return 'Only text can be added to the current reply.';
    if ((message.contactContext?.id || null) !== (view.activeMessage?.contactContext?.id || null))
      return 'This message is about a different contact. Send it as a separate reply.';
    if ((message.building?.id || null) !== (view.activeMessage?.building?.id || null))
      return 'This message was queued for a different building. Send it as a separate reply.';
    return '';
  };
  view.renderQueue = function renderQueue() {
    const height = view.panel.getBoundingClientRect().height;
    const follow = view.atLatest();
    view.queue.hidden = !view.queuedMessages.length;
    view.queueState.textContent = `${view.queuePaused ? 'Queue paused' : 'Queued'} · ${view.queuedMessages.length} ${view.queuedMessages.length === 1 ? 'message' : 'messages'}`;
    view.resumeQueue.hidden = !view.queuePaused;
    view.queueList.replaceChildren();
    for (const [index, message] of view.queuedMessages.entries()) {
      const item = view.el('li', 'assistant-queue-item');
      item.setAttribute('data-message-id', String(message.id));
      const details = view.el('div', 'assistant-queue-details');
      details.append(view.el('p', 'assistant-queue-text', message.text || 'Attached files'));
      if (message.contactContext) details.append(view.contactChip(message.contactContext));
      if (message.attachments.length)
        details.append(
          view.el(
            'p',
            'assistant-queue-files',
            message.attachments.map((file) => file.name).join(', '),
          ),
        );
      if (message.building)
        details.append(view.el('p', 'assistant-queue-building', message.building.name));
      if (message.retry)
        details.append(view.el('p', 'assistant-queue-retry', 'Incomplete reply · ready to retry'));
      for (const added of message.steeredMessages || []) {
        details.append(view.el('p', 'assistant-queue-files', `Added to reply: ${added.text}`));
        if (added.contactContext) details.append(view.contactChip(added.contactContext));
      }
      if (view.pendingInjection?.message.id === message.id)
        details.append(
          view.el(
            'p',
            'assistant-queue-retry',
            'Waiting for the current reply to incorporate this text…',
          ),
        );
      const actions = view.el('div', 'assistant-queue-actions');
      const inject = view.el('button', 'assistant-queue-inject', '↑');
      inject.type = 'button';
      const unavailable = view.injectionUnavailable(message);
      inject.disabled = Boolean(unavailable);
      inject.setAttribute(
        'aria-label',
        `Add queued message ${index + 1} to current reply: ${(message.text || 'Attached files').slice(0, 80)}`,
      );
      inject.title = unavailable || 'Add queued text to the current reply';
      inject.addEventListener('click', () => view.injectMessage(message));
      const remove = view.el('button', 'assistant-queue-remove', '×');
      remove.type = 'button';
      remove.setAttribute(
        'aria-label',
        `Remove queued message ${index + 1}: ${(message.text || 'Attached files').slice(0, 80)}`,
      );
      remove.disabled = view.pendingInjection?.message.id === message.id;
      remove.addEventListener('click', () => {
        if (view.pendingInjection?.message.id === message.id) return;
        view.queuedMessages = view.queuedMessages.filter((entry) => entry.id !== message.id);
        if (!view.queuedMessages.length) view.queuePaused = false;
        view.renderQueue();
        view.controls();
        (view.queueList.children[index]?.querySelector('button') || view.input).focus();
      });
      actions.append(inject, remove);
      item.append(details, actions);
      view.queueList.append(item);
    }
    view.queueResize(height, follow);
  };
  view.injectMessage = async function injectMessage(message) {
    if (
      view.injectionUnavailable(message) ||
      !view.queuedMessages.some((entry) => entry.id === message.id)
    )
      return;
    // Bind before dispatch: the server may act even if both acknowledgements are
    // lost. A retained queue item must never retry that work as a new send group.
    message.requestId = view.activeMessage.requestId;
    message.requestGroupBound = true;
    const pending = {
      message,
      messageId: `queue-${message.id}`,
      generation: view.generation,
      run: view.activeRun,
    };
    // Register before POST: the stream can acknowledge incorporation first.
    view.pendingInjection = pending;
    view.renderQueue();
    view.controls();
    try {
      await steerAssistant({
        ...pending.run,
        messageId: pending.messageId,
        text: message.text,
        contactContext: message.contactContext,
        signal: view.request.signal,
      });
      // HTTP acceptance does not mean the active model has used the message.
    } catch {
      if (view.disposed || view.pendingInjection !== pending) return;
      view.queuePaused = true;
      pending.error =
        'Adding this text to the reply could not be confirmed. It is kept in the queue; wait for the reply to finish before resuming.';
      view.fileError(new Error(pending.error));
      view.renderQueue();
      view.controls();
    }
  };
  view.submit = function submit(event) {
    event.preventDefault();
    const text = view.input.value.trim();
    if (
      !view.entered ||
      view.disposed ||
      !view.available ||
      view.readingFiles ||
      (!text && !view.draftAttachments.length)
    )
      return;
    if (view.queuedMessages.length + Number(view.busy) >= view.maxPendingMessages) {
      view.fileError(
        new Error(
          'Up to 10 messages can be waiting or responding. Remove a queued message or wait for a reply; your draft is kept.',
        ),
      );
      return;
    }
    const attachments = view.draftAttachments;
    const contactContext = view.draftContactContext ? { ...view.draftContactContext } : undefined;
    try {
      boundedMessages([
        {
          role: 'user',
          content: text || ATTACHMENT_ONLY_CONTENT,
          ...(attachments.length ? { attachments } : {}),
          ...(contactContext ? { contactContext } : {}),
        },
      ]);
    } catch (error) {
      view.fileError(error);
      return;
    }
    view.queuedMessages.push({
      id: ++view.nextMessageId,
      requestId: crypto.randomUUID(),
      text,
      attachments,
      ...(contactContext ? { contactContext } : {}),
      building: view.building ? { ...view.building } : null,
    });
    view.input.value = '';
    view.draftAttachments = [];
    view.attachmentError.hidden = true;
    view.renderDraftFiles();
    view.resizeInput();
    view.renderQueue();
    view.controls();
    return view.drainQueue();
  };
  view.drainQueue = function drainQueue() {
    if (
      view.disposed ||
      !view.entered ||
      !view.available ||
      view.busy ||
      view.pendingInjection ||
      view.queuePaused ||
      !view.queuedMessages.length
    )
      return;
    const message = view.queuedMessages.shift();
    view.activeMessage = message;
    view.busy = true;
    view.renderQueue();
    view.controls();
    return view.respond(message);
  };
}
