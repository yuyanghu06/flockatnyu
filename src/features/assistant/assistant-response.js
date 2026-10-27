import { ATTACHMENT_ONLY_CONTENT } from './chat-attachments.js';
import { boundedMessages, streamAssistant } from './chat-client.js';
import { renderAssistantMarkdown } from './assistant-markdown.js';

export function installAssistantResponse(view) {
  view.stopRequest = function stopRequest() {
    view.queuePaused = true;
    view.renderQueue();
    view.controls();
    view.replyRender?.flush();
    view.request?.abort();
  };
  view.abort = function abort() {
    if (view.disposed) view.replyRender?.cancel();
    else {
      view.replyRender?.flush();
      view.replyRender?.interrupt();
    }
    view.replyRender = null;
    view.generation++;
    view.request?.abort();
    view.request = null;
    view.busy = false;
    view.activeMessage = null;
    view.activeRun = null;
    view.pendingInjection = null;
    view.controls();
  };
  view.bubble = function bubble(role, text) {
    const height = view.panel.getBoundingClientRect().height;
    const box = view.el('article', 'assistant-message assistant-' + role);
    const content = view.el(
      role === 'user' ? 'p' : 'div',
      role === 'user'
        ? 'assistant-message-text'
        : 'assistant-message-text assistant-markdown is-thinking',
      text,
    );
    const tools = view.el('ol', 'assistant-tools');
    tools.hidden = true;
    tools.setAttribute('aria-label', 'Tool activity');
    tools.setAttribute('aria-live', 'polite');
    if (role === 'user') box.setAttribute('aria-label', 'You');
    else box.append(view.el('p', 'assistant-role', 'FlockBot'), tools);
    box.append(content);
    view.transcript.append(box);
    view.transcript.hidden = false;
    while (view.transcript.children.length > 40) view.transcript.firstElementChild.remove();
    view.queueResize(height, true);
    return { box, content, tools, toolRows: new Map() };
  };
  view.updateTool = function updateTool(reply, event, resize = true) {
    const height = resize ? view.panel.getBoundingClientRect().height : 0;
    const follow = view.atLatest();
    let record = reply.toolRows.get(event.id);
    if (!record) {
      const row = view.el('li', 'assistant-tool');
      row.title = event.name;
      const icon = view.el('span', 'assistant-tool-icon');
      icon.setAttribute('aria-hidden', 'true');
      const name = view.el('span', 'assistant-tool-name', event.name.replaceAll('_', ' '));
      const state = view.el('span', 'assistant-tool-state');
      row.append(icon, name, state);
      reply.tools.append(row);
      record = { row, state };
      reply.toolRows.set(event.id, record);
    }
    record.status = event.status;
    record.row.setAttribute('data-status', event.status);
    record.state.textContent = {
      running: 'Running…',
      completed: 'Done',
      partial: 'Partial result',
      failed: 'Failed',
      cancelled: 'Stopped',
      interrupted: 'Interrupted',
    }[event.status];
    reply.tools.hidden = false;
    if (reply.content.textContent === 'Thinking…') {
      reply.content.textContent = '';
      reply.content.classList.remove('is-thinking');
    }
    if (resize) view.queueResize(height, follow);
  };
  view.settleTools = function settleTools(reply, status) {
    for (const [id, record] of reply.toolRows)
      if (record.status === 'running') view.updateTool(reply, { id, status });
  };
  view.renderReply = function renderReply(reply, text) {
    if (reply.renderedText === text) return;
    reply.renderedText = text;
    reply.content.classList.remove('is-thinking');
    reply.content.innerHTML = renderAssistantMarkdown(text);
  };
  view.respond = async function respond(message) {
    message.requestGroupBound = true;
    const { text, attachments } = message;
    const id = ++view.generation,
      controller = new AbortController();
    view.request = controller;
    view.activeRun = null;
    const userBubble = view.bubble('user', text || 'Attached files');
    if (message.contactContext) userBubble.box.append(view.contactChip(message.contactContext));
    if (attachments.length) {
      const files = view.el('ul', 'assistant-message-files');
      for (const file of attachments) files.append(view.el('li', '', file.name));
      userBubble.box.append(files);
    }
    for (const added of message.steeredMessages || []) {
      const addedBubble = view.bubble('user', added.text);
      if (added.contactContext) addedBubble.box.append(view.contactChip(added.contactContext));
    }
    const reply = view.bubble('assistant', 'Thinking…');
    view.controls();
    view.announcement.textContent = 'Assistant is responding…';
    let partial = '';
    let renderFrame = 0,
      events = [],
      renderedPartial = '';
    const cancelRender = () => {
      if (renderFrame) cancelAnimationFrame(renderFrame);
      renderFrame = 0;
      events = [];
    };
    const flush = (finalText) => {
      if (renderFrame) cancelAnimationFrame(renderFrame);
      renderFrame = 0;
      if (view.disposed || id !== view.generation) {
        events = [];
        return;
      }
      const text = finalText ?? partial;
      if (!events.length && text === renderedPartial) return;
      const height = view.panel.getBoundingClientRect().height;
      const follow = view.atLatest();
      for (const event of events) {
        if (event.type === 'tool') view.updateTool(reply, event, false);
      }
      events = [];
      if (text || finalText !== undefined) view.renderReply(reply, text);
      renderedPartial = text;
      view.queueResize(height, follow);
    };
    const rendering = {
      flush,
      cancel: cancelRender,
      interrupt() {
        view.settleTools(reply, 'cancelled');
        reply.content.classList.remove('is-thinking');
        if (!partial) reply.content.textContent = '';
        reply.box.append(
          view.el(
            'p',
            'assistant-message-error',
            'Interrupted while the map was loading. Resume this message from the queue.',
          ),
        );
      },
    };
    view.replyRender = rendering;
    try {
      // Build history at dispatch, after the preceding reply has completed.
      const priorConversation = view.conversation;
      const userMessages = () => [
        {
          role: 'user',
          content: text || ATTACHMENT_ONLY_CONTENT,
          ...(attachments.length ? { attachments } : {}),
          ...(message.contactContext ? { contactContext: { ...message.contactContext } } : {}),
        },
        ...(message.steeredMessages || []).map((added) => ({
          role: 'user',
          content: added.text,
          ...(added.contactContext ? { contactContext: { ...added.contactContext } } : {}),
        })),
      ];
      const messages = boundedMessages([...priorConversation, ...userMessages()]);
      const answer = await streamAssistant({
        messages,
        requestId: message.requestId,
        buildingId: message.building?.id,
        signal: controller.signal,
        onEvent(event) {
          if (view.disposed || id !== view.generation || controller.signal.aborted) return;
          if (event.type === 'run') {
            view.activeRun = { runId: event.runId, steeringToken: event.steeringToken };
            view.renderQueue();
            view.controls();
            return;
          }
          if (event.type === 'steering') {
            const pending = view.pendingInjection;
            if (
              !pending ||
              pending.generation !== id ||
              pending.messageId !== event.messageId ||
              event.status !== 'applied'
            )
              return;
            message.steeredMessages ??= [];
            if (!message.steeredMessages.some((added) => added.messageId === event.messageId)) {
              message.steeredMessages.push({
                messageId: event.messageId,
                text: pending.message.text,
                ...(pending.message.contactContext
                  ? { contactContext: { ...pending.message.contactContext } }
                  : {}),
              });
              const added = view.bubble('user', pending.message.text);
              if (pending.message.contactContext)
                added.box.append(view.contactChip(pending.message.contactContext));
              view.transcript.insertBefore(added.box, reply.box);
            }
            view.queuedMessages = view.queuedMessages.filter(
              (entry) => entry.id !== pending.message.id,
            );
            view.pendingInjection = null;
            if (pending.error && view.attachmentError.textContent === pending.error)
              view.attachmentError.hidden = true;
            view.renderQueue();
            view.controls();
            view.announcement.textContent = 'Queued text added to the current reply.';
            return;
          }
          if (event.type === 'reset') {
            flush();
            partial = '';
            renderedPartial = '';
            view.renderReply(reply, '');
            return;
          }
          if (
            event.type === 'tool' &&
            event.status === 'completed' &&
            event.name === 'upsert_map_event'
          )
            document.dispatchEvent(new CustomEvent('campus-map-updated'));
          if (event.type === 'done') {
            flush(partial || 'The assistant returned an empty reply.');
            return;
          }
          if (event.type === 'delta') partial += event.text;
          else if (event.type === 'tool') events.push(event);
          else return;
          if (!renderFrame) {
            if (typeof requestAnimationFrame === 'function')
              renderFrame = requestAnimationFrame(() => flush());
            else flush();
          }
        },
      });
      if (view.disposed || id !== view.generation) return;
      if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
      if (!answer.trim())
        throw new Error('The assistant returned an empty reply. Retry this message.');
      flush(answer);
      view.settleTools(reply, 'interrupted');
      view.conversation = boundedMessages([
        ...priorConversation,
        ...userMessages(),
        { role: 'assistant', content: answer },
      ]);
      view.announcement.textContent = 'Reply complete.';
    } catch (error) {
      if (view.disposed || id !== view.generation) return;
      flush();
      view.settleTools(reply, error.name === 'AbortError' ? 'cancelled' : 'failed');
      const height = view.panel.getBoundingClientRect().height;
      const follow = view.atLatest();
      reply.content.classList.remove('is-thinking');
      if (!partial) reply.content.textContent = '';
      reply.box.append(
        view.el(
          'p',
          'assistant-message-error',
          error.name === 'AbortError' ? 'Stopped. This reply is incomplete.' : error.message,
        ),
      );
      view.queueResize(height, follow);
      view.announcement.textContent =
        error.name === 'AbortError' ? 'Reply stopped.' : 'The reply could not finish.';
      view.queuePaused = true;
      view.queuedMessages.unshift({ ...message, retry: true });
      view.renderQueue();
    } finally {
      cancelRender();
      if (view.replyRender === rendering) view.replyRender = null;
      if (id === view.generation) {
        if (view.pendingInjection?.generation === id) {
          view.queuePaused = true;
          view.pendingInjection = null;
          view.fileError(
            new Error(
              'The reply ended before it confirmed the queued text. The message is kept and the queue is paused.',
            ),
          );
        }
        view.busy = false;
        view.activeMessage = null;
        view.activeRun = null;
        view.request = null;
        view.renderQueue();
        view.controls();
        view.drainQueue();
      }
    }
  };
}
