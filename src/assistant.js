import { ATTACHMENT_ACCEPT, ATTACHMENT_ONLY_CONTENT, readAttachmentFiles } from './chat-attachments.js';
import { boundedMessages, getAssistantStatus, streamAssistant } from './chat-client.js';
import { renderAssistantMarkdown } from './assistant-markdown.js';
import { assistantShortcut } from './assistant-presentation.js';
const assistantLogoUrl = new URL('../assets/branding/tech-at-assistant.png', import.meta.url).href;
const assistantHoverLogoUrl = new URL('../assets/branding/tech-at-assistant-hover.svg', import.meta.url).href;

export function createAssistant({ container = document.body, getBuilding = () => null } = {}) {
  let entered = false, disposed = false, available = false, busy = false;
  let draftAttachments = [], readingFiles = false;
  const maxPendingMessages = 10;
  const maxPendingAttachmentBytes = 20 * 1024 * 1024;
  let queuedMessages = [], queuePaused = false, activeMessage = null, nextMessageId = 0;
  let conversation = [], request, statusRequest, generation = 0, previousFocus, replyRender;
  let closing = false, closeTimer;
  let resizeAnimation, resizeFrame = 0, resizeFrom;
  let followFrame = 0;
  let pendingScroll = false;
  let building = getBuilding();
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const logo = () => {
    const image = el('img', 'assistant-logo');
    image.src = assistantLogoUrl;
    image.alt = '';
    image.width = image.height = 28;
    return image;
  };
  const root = el('div', 'campus-assistant'); root.hidden = true;
  const launcher = el('button', 'assistant-launcher');
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Open campus assistant');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'campus-assistant-panel');
  const keyboard = assistantShortcut(globalThis.navigator);
  if (!keyboard.mobile) launcher.setAttribute('aria-keyshortcuts', keyboard.key);
  const shortcut = el('kbd', 'assistant-shortcut', keyboard.label); shortcut.hidden = keyboard.mobile;
  const launcherLogo = el('span', 'assistant-logo assistant-launcher-logo');
  launcherLogo.setAttribute('aria-hidden', 'true');
  launcherLogo.append(logo());
  let animatedLogo;
  const stopLogoAnimation = () => {
    animatedLogo?.remove(); animatedLogo = null;
    launcherLogo.classList.remove('is-animated');
  };
  const startLogoAnimation = () => {
    if (animatedLogo || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const image = logo();
    image.classList.add('assistant-logo-motion');
    image.addEventListener('load', () => {
      if (animatedLogo === image) launcherLogo.classList.add('is-animated');
    }, { once: true });
    image.addEventListener('error', stopLogoAnimation, { once: true });
    animatedLogo = image;
    image.src = assistantHoverLogoUrl;
    launcherLogo.append(image);
  };
  launcher.addEventListener('pointerenter', startLogoAnimation);
  launcher.addEventListener('pointerleave', stopLogoAnimation);
  launcher.addEventListener('focus', startLogoAnimation);
  launcher.addEventListener('blur', stopLogoAnimation);
  launcher.append(launcherLogo, el('span', '', 'Ask Tech@NYU'), shortcut);
  const panel = el('dialog', 'assistant-panel');
  panel.id = 'campus-assistant-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Campus assistant');
  const header = el('header', 'assistant-header');
  const identity = el('div', 'assistant-identity');
  identity.append(logo(), el('span', '', 'Flock@NYU'));
  const closeButton = el('button', 'assistant-icon-button', '×');
  closeButton.type = 'button'; closeButton.setAttribute('aria-label', 'Close assistant');
  const headerActions = el('div', 'assistant-header-actions');
  const stop = el('button', 'assistant-stop'); stop.type = 'button'; stop.hidden = true;
  const stopIndicator = el('span', 'assistant-stop-indicator'); stopIndicator.setAttribute('aria-hidden', 'true'); stop.append(stopIndicator, el('span', '', 'Stop'));
  stop.setAttribute('aria-label', 'Stop generating');
  headerActions.append(stop, closeButton); header.append(identity, headerActions);
  const form = el('form', 'assistant-form');
  const label = el('label', 'assistant-input-label', 'Message'), input = el('textarea');
  input.id = 'campus-assistant-message'; label.htmlFor = input.id;
  input.rows = 1; input.maxLength = 8000; input.placeholder = 'Ask about Tech@NYU…';
  const compose = el('div', 'assistant-compose');
  const send = el('button', 'assistant-send', '↑'); send.type = 'submit'; send.setAttribute('aria-label', 'Send message');
  const attach = el('button', 'assistant-attach'); attach.type = 'button';
  attach.setAttribute('aria-label', 'Attach files');
  attach.title = 'Attach PNG, JPEG, WebP, PDF, or UTF-8 text/code · up to 4 files · 5 MiB each (text 128 KiB)';
  attach.innerHTML = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9"/><path d="m6 14 8-8"/></svg>';
  const fileInput = el('input'); fileInput.type = 'file'; fileInput.multiple = true; fileInput.accept = ATTACHMENT_ACCEPT; fileInput.hidden = true;
  fileInput.setAttribute('aria-label', 'Choose files to attach');
  const draftFiles = el('div', 'assistant-attachments'); draftFiles.hidden = true;
  draftFiles.setAttribute('aria-label', 'Attached files');
  const attachmentError = el('p', 'assistant-attachment-error'); attachmentError.hidden = true; attachmentError.setAttribute('role', 'alert');
  const queue = el('section', 'assistant-queue'); queue.hidden = true; queue.setAttribute('aria-label', 'Message queue');
  const queueHeader = el('div', 'assistant-queue-header');
  const queueState = el('p', 'assistant-queue-state'); queueState.setAttribute('role', 'status');
  const resumeQueue = el('button', 'assistant-queue-action', 'Resume'); resumeQueue.type = 'button'; resumeQueue.hidden = true;
  resumeQueue.setAttribute('aria-label', 'Resume queued messages');
  const clearQueue = el('button', 'assistant-queue-action', 'Clear'); clearQueue.type = 'button'; clearQueue.setAttribute('aria-label', 'Clear queued messages');
  queueHeader.append(queueState, resumeQueue, clearQueue);
  const queueList = el('ol', 'assistant-queue-list'); queueList.setAttribute('aria-label', 'Queued messages');
  queue.append(queueHeader, queueList);
  compose.append(attach, input, send);
  form.append(queue, label, compose, fileInput, draftFiles, attachmentError);
  const connection = el('div', 'assistant-connection');
  const service = el('p', 'assistant-service', 'Checking connection…'); service.setAttribute('role', 'status');
  const retry = el('button', 'assistant-retry', 'Retry'); retry.type = 'button'; retry.hidden = true;
  connection.hidden = true;
  connection.append(service, retry); form.append(connection);
  const transcript = el('div', 'assistant-transcript'); transcript.hidden = true;
  transcript.setAttribute('role', 'log'); transcript.setAttribute('aria-label', 'Conversation'); transcript.setAttribute('aria-live', 'off');
  const announcement = el('p', 'assistant-announcement');
  announcement.setAttribute('role', 'status'); announcement.setAttribute('aria-live', 'polite');
  panel.append(header, transcript, form, announcement); root.append(launcher, panel); container.append(root);

  const atLatest = () => transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop < 2;
  function pauseFollow() {
    if (followFrame) cancelAnimationFrame(followFrame);
    followFrame = 0;
  }
  transcript.addEventListener('wheel', event => { if (event.deltaY < 0) pauseFollow(); }, { passive: true });
  transcript.addEventListener('pointerdown', pauseFollow);

  function followLatest() {
    transcript.scrollTop = transcript.scrollHeight;
    if (followFrame || typeof requestAnimationFrame !== 'function') return;
    const follow = () => {
      followFrame = 0;
      if (!panel.open || closing || disposed) return;
      transcript.scrollTop = transcript.scrollHeight;
      if (resizeFrame || resizeAnimation?.playState === 'running') followFrame = requestAnimationFrame(follow);
    };
    followFrame = requestAnimationFrame(follow);
  }
  function queueResize(fromHeight, follow = false) {
    // A height tween may shrink the transcript, but must always fit the footer.
    if (panel.open) panel.style.minHeight = `min(${Math.ceil(header.getBoundingClientRect().height + form.getBoundingClientRect().height)}px, var(--assistant-max-height))`;
    if (follow) {
      if (!panel.open || closing) pendingScroll = true;
      else followLatest();
    }
    if (!panel.open || closing || typeof panel.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (resizeFrame) return;
    resizeFrom = fromHeight;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (!panel.open || closing) return;
      resizeAnimation?.cancel();
      const target = panel.getBoundingClientRect().height;
      if (Math.abs(target - resizeFrom) < .5) return;
      resizeAnimation = panel.animate([{ height: `${resizeFrom}px` }, { height: `${target}px` }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  function resizeInput() {
    const height = panel.getBoundingClientRect().height;
    const follow = atLatest();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight || 34, 132) + 'px';
    queueResize(height, follow);
  }
  function controls() {
    // Drafting remains possible while configuration or the network is unavailable.
    input.disabled = !entered;
    attach.disabled = !entered || readingFiles;
    send.disabled = !entered || !available || readingFiles || (!input.value.trim() && !draftAttachments.length);
    const willQueue = busy || queuePaused || queuedMessages.length > 0;
    send.setAttribute('aria-label', willQueue ? 'Queue message' : 'Send message');
    send.title = willQueue ? 'Add this message to the queue' : 'Send message';
    stop.hidden = !busy; stop.disabled = !entered;
    resumeQueue.disabled = !entered || !available || busy;
    // The composer stays usable while the transcript is being updated.
    transcript.setAttribute('aria-busy', String(busy));
  }
  function renderQueue() {
    const height = panel.getBoundingClientRect().height;
    const follow = atLatest();
    queue.hidden = !queuedMessages.length;
    queueState.textContent = `${queuePaused ? 'Queue paused' : 'Queued'} · ${queuedMessages.length} ${queuedMessages.length === 1 ? 'message' : 'messages'}`;
    resumeQueue.hidden = !queuePaused;
    queueList.replaceChildren();
    for (const [index, message] of queuedMessages.entries()) {
      const item = el('li', 'assistant-queue-item'); item.setAttribute('data-message-id', String(message.id));
      const details = el('div', 'assistant-queue-details');
      details.append(el('p', 'assistant-queue-text', message.text || 'Attached files'));
      if (message.attachments.length) details.append(el('p', 'assistant-queue-files', message.attachments.map(file => file.name).join(', ')));
      if (message.building) details.append(el('p', 'assistant-queue-building', message.building.name));
      if (message.retry) details.append(el('p', 'assistant-queue-retry', 'Incomplete reply · ready to retry'));
      const remove = el('button', 'assistant-queue-remove', '×'); remove.type = 'button';
      remove.setAttribute('aria-label', `Remove queued message ${index + 1}: ${(message.text || 'Attached files').slice(0, 80)}`);
      remove.addEventListener('click', () => {
        queuedMessages = queuedMessages.filter(entry => entry.id !== message.id);
        if (!queuedMessages.length) queuePaused = false;
        renderQueue(); controls();
        (queueList.children[index]?.querySelector('button') || input).focus();
      });
      item.append(details, remove); queueList.append(item);
    }
    queueResize(height, follow);
  }
  function renderDraftFiles() {
    const height = panel.getBoundingClientRect().height;
    const follow = atLatest();
    draftFiles.replaceChildren(); draftFiles.hidden = !draftAttachments.length;
    for (const [index, file] of draftAttachments.entries()) {
      const chip = el('div', 'assistant-attachment');
      if (file.mimeType.startsWith('image/')) {
        const preview = el('img', 'assistant-attachment-preview'); preview.alt = ''; preview.src = `data:${file.mimeType};base64,${file.data}`; chip.append(preview);
      }
      const name = el('span', 'assistant-attachment-name', file.name); name.title = file.name;
      const remove = el('button', 'assistant-attachment-remove', '×'); remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${file.name}`); remove.disabled = readingFiles;
      remove.addEventListener('click', () => {
        draftAttachments = draftAttachments.filter((_, i) => i !== index);
        attachmentError.hidden = true; renderDraftFiles(); controls(); input.focus();
      });
      chip.append(name, remove); draftFiles.append(chip);
    }
    queueResize(height, follow);
  }
  function fileError(error) {
    attachmentError.textContent = error.message; attachmentError.hidden = false;
  }
  function attachmentSize(attachments) {
    return attachments.reduce((sum, file) => sum + file.data.length / 4 * 3 - (file.data.endsWith('==') ? 2 : file.data.endsWith('=') ? 1 : 0), 0);
  }
  function pendingAttachmentSize() {
    return queuedMessages.reduce((sum, message) => sum + attachmentSize(message.attachments), 0) + (activeMessage ? attachmentSize(activeMessage.attachments) : 0);
  }
  async function addFiles(files) {
    if (!entered || disposed || readingFiles || !files?.length) return;
    readingFiles = true; attachmentError.hidden = true; controls(); renderDraftFiles();
    try {
      const attachments = await readAttachmentFiles(files, draftAttachments);
      if (pendingAttachmentSize() + attachmentSize(attachments) > maxPendingAttachmentBytes) throw new Error('Files in active and queued messages plus this draft can total up to 20 MiB. Remove a queued message or file, or wait for a reply.');
      if (!disposed) draftAttachments = attachments;
    } catch (error) { if (!disposed) fileError(error); }
    finally { readingFiles = false; fileInput.value = ''; if (!disposed) { renderDraftFiles(); controls(); } }
  }
  function stopRequest() { queuePaused = true; renderQueue(); controls(); replyRender?.flush(); request?.abort(); }
  function abort() {
    if (disposed) replyRender?.cancel();
    else { replyRender?.flush(); replyRender?.interrupt(); }
    replyRender = null; generation++; request?.abort(); request = null; busy = false; activeMessage = null; controls();
  }
  function open() {
    if (!entered || disposed) return;
    if (closing) { clearTimeout(closeTimer); closing = false; panel.classList.remove('is-closing'); }
    else {
      if (panel.open) return;
      previousFocus = document.activeElement;
      panel.hidden = false;
      panel.showModal();
      launcher.setAttribute('aria-expanded', 'true');
    }
    resizeInput();
    if (pendingScroll) { pendingScroll = false; followLatest(); }
    input.focus();
  }
  function finishClose() {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    if (followFrame) cancelAnimationFrame(followFrame);
    followFrame = 0;
    resizeFrame = 0; resizeAnimation?.cancel();
    clearTimeout(closeTimer); closing = false; panel.classList.remove('is-closing');
    panel.close(); panel.hidden = true; launcher.setAttribute('aria-expanded', 'false');
    if (entered) (previousFocus?.isConnected && typeof previousFocus.focus === 'function' ? previousFocus : launcher).focus();
    previousFocus = null;
  }
  function close({ immediate = false } = {}) {
    if (!panel.open) return;
    // Dismiss the panel without interrupting the active response.
    if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) { finishClose(); return; }
    if (closing) return;
    closing = true; panel.classList.add('is-closing');
    closeTimer = setTimeout(finishClose, 180);
  }
  async function status() {
    statusRequest?.abort();
    const controller = new AbortController(); statusRequest = controller;
    available = false; controls(); service.textContent = 'Checking connection…';
    service.setAttribute('data-connected', 'false'); retry.hidden = true; connection.hidden = true;
    try {
      const data = await getAssistantStatus({ signal: controller.signal });
      if (disposed || !entered || statusRequest !== controller) return;
      available = data.chat.configured && data.access.allowed;
      service.textContent = !data.access.allowed ? 'Session access required' : !data.chat.configured ? 'Assistant setup pending' : data.discord?.liveConfigured && data.discord?.liveAllowed ? 'Ready to ask · live Discord' : data.google?.configured && data.google?.allowed ? 'Ready to ask · Google' : data.miro?.configured ? 'Ready to ask · Miro' : 'Ready to ask · club sources unavailable';
      service.title = !data.access.allowed ? 'Assistant access is not available for this session.' : !data.chat.configured ? 'The assistant has not been configured on the server.' : '';
      service.setAttribute('data-connected', String(available)); retry.hidden = available; connection.hidden = available;
    } catch (error) {
      if (error.name !== 'AbortError' && statusRequest === controller && entered && !disposed) {
        service.textContent = 'Assistant offline'; service.title = error.message;
        service.setAttribute('data-connected', 'false'); retry.hidden = false; connection.hidden = false;
      }
    } finally { if (statusRequest === controller) { controls(); drainQueue(); } }
  }
  function bubble(role, text) {
    const height = panel.getBoundingClientRect().height;
    const box = el('article', 'assistant-message assistant-' + role);
    const content = el(role === 'user' ? 'p' : 'div', role === 'user' ? 'assistant-message-text' : 'assistant-message-text assistant-markdown is-thinking', text);
    const tools = el('ol', 'assistant-tools'); tools.hidden = true;
    tools.setAttribute('aria-label', 'Tool activity'); tools.setAttribute('aria-live', 'polite');
    if (role === 'user') box.setAttribute('aria-label', 'You');
    else box.append(el('p', 'assistant-role', 'FlockBot'), tools);
    box.append(content); transcript.append(box); transcript.hidden = false;
    while (transcript.children.length > 40) transcript.firstElementChild.remove();
    queueResize(height, true); return { box, content, tools, toolRows: new Map() };
  }
  function updateTool(reply, event, resize = true) {
    const height = resize ? panel.getBoundingClientRect().height : 0;
    const follow = atLatest();
    let record = reply.toolRows.get(event.id);
    if (!record) {
      const row = el('li', 'assistant-tool'); row.title = event.name;
      const icon = el('span', 'assistant-tool-icon'); icon.setAttribute('aria-hidden', 'true');
      const name = el('span', 'assistant-tool-name', event.name.replaceAll('_', ' '));
      const state = el('span', 'assistant-tool-state');
      row.append(icon, name, state); reply.tools.append(row);
      record = { row, state }; reply.toolRows.set(event.id, record);
    }
    record.status = event.status; record.row.setAttribute('data-status', event.status);
    record.state.textContent = { running: 'Running…', completed: 'Done', partial: 'Partial result', failed: 'Failed', cancelled: 'Stopped', interrupted: 'Interrupted' }[event.status];
    reply.tools.hidden = false;
    if (reply.content.textContent === 'Thinking…') { reply.content.textContent = ''; reply.content.classList.remove('is-thinking'); }
    if (resize) queueResize(height, follow);
  }
  function settleTools(reply, status) {
    for (const [id, record] of reply.toolRows) if (record.status === 'running') updateTool(reply, { id, status });
  }
  function renderReply(reply, text) {
    if (reply.renderedText === text) return;
    reply.renderedText = text;
    reply.content.classList.remove('is-thinking');
    reply.content.innerHTML = renderAssistantMarkdown(text);
  }
  function submit(event) {
    event.preventDefault();
    const text = input.value.trim(); if (!entered || disposed || !available || readingFiles || (!text && !draftAttachments.length)) return;
    if (queuedMessages.length + Number(busy) >= maxPendingMessages) {
      fileError(new Error('Up to 10 messages can be waiting or responding. Remove a queued message or wait for a reply; your draft is kept.')); return;
    }
    const attachments = draftAttachments;
    try { boundedMessages([{ role: 'user', content: text || ATTACHMENT_ONLY_CONTENT, ...(attachments.length ? { attachments } : {}) }]); }
    catch (error) { fileError(error); return; }
    queuedMessages.push({ id: ++nextMessageId, text, attachments, building: building ? { ...building } : null });
    input.value = ''; draftAttachments = []; attachmentError.hidden = true; renderDraftFiles(); resizeInput();
    renderQueue(); controls(); return drainQueue();
  }
  function drainQueue() {
    if (disposed || !entered || !available || busy || queuePaused || !queuedMessages.length) return;
    const message = queuedMessages.shift();
    activeMessage = message; busy = true; renderQueue(); controls();
    return respond(message);
  }
  async function respond(message) {
    const { text, attachments } = message;
    const id = ++generation, controller = new AbortController(); request = controller;
    const userBubble = bubble('user', text || 'Attached files');
    if (attachments.length) {
      const files = el('ul', 'assistant-message-files');
      for (const file of attachments) files.append(el('li', '', file.name));
      userBubble.box.append(files);
    }
    const reply = bubble('assistant', 'Thinking…'); controls();
    announcement.textContent = 'Assistant is responding…'; let partial = '';
    let renderFrame = 0, events = [], renderedPartial = '';
    const cancelRender = () => {
      if (renderFrame) cancelAnimationFrame(renderFrame);
      renderFrame = 0; events = [];
    };
    const flush = (finalText) => {
      if (renderFrame) cancelAnimationFrame(renderFrame);
      renderFrame = 0;
      if (disposed || id !== generation) { events = []; return; }
      const text = finalText ?? partial;
      if (!events.length && text === renderedPartial) return;
      const height = panel.getBoundingClientRect().height;
      const follow = atLatest();
      for (const event of events) {
        if (event.type === 'tool') updateTool(reply, event, false);
      }
      events = [];
      if (text || finalText !== undefined) renderReply(reply, text);
      renderedPartial = text;
      queueResize(height, follow);
    };
    const rendering = { flush, cancel: cancelRender, interrupt() {
      settleTools(reply, 'cancelled'); reply.content.classList.remove('is-thinking');
      if (!partial) reply.content.textContent = '';
      reply.box.append(el('p', 'assistant-message-error', 'Interrupted while the map was loading. Resume this message from the queue.'));
    } }; replyRender = rendering;
    try {
      // Build history at dispatch, after the preceding reply has completed.
      const messages = boundedMessages([...conversation, { role: 'user', content: text || ATTACHMENT_ONLY_CONTENT, ...(attachments.length ? { attachments } : {}) }]);
      const answer = await streamAssistant({ messages, buildingId: message.building?.id, signal: controller.signal, onEvent(event) {
        if (disposed || id !== generation || controller.signal.aborted) return;
        if (event.type === 'tool' && event.status === 'completed' && event.name === 'upsert_map_event') document.dispatchEvent(new CustomEvent('campus-map-updated'));
        if (event.type === 'done') { flush(partial || 'The assistant returned an empty reply.'); return; }
        if (event.type === 'delta') partial += event.text;
        else if (event.type === 'tool') events.push(event);
        else return;
        if (!renderFrame) {
          if (typeof requestAnimationFrame === 'function') renderFrame = requestAnimationFrame(() => flush());
          else flush();
        }
      } });
      if (disposed || id !== generation) return;
      if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError');
      if (!answer.trim()) throw new Error('The assistant returned an empty reply. Retry this message.');
      flush(answer);
      settleTools(reply, 'interrupted');
      conversation = boundedMessages([...messages, { role: 'assistant', content: answer }]); announcement.textContent = 'Reply complete.';
    } catch (error) {
      if (disposed || id !== generation) return;
      flush();
      settleTools(reply, error.name === 'AbortError' ? 'cancelled' : 'failed');
      const height = panel.getBoundingClientRect().height;
      const follow = atLatest();
      reply.content.classList.remove('is-thinking');
      if (!partial) reply.content.textContent = '';
      reply.box.append(el('p', 'assistant-message-error', error.name === 'AbortError' ? 'Stopped. This reply is incomplete.' : error.message));
      queueResize(height, follow);
      announcement.textContent = error.name === 'AbortError' ? 'Reply stopped.' : 'The reply could not finish.';
      queuePaused = true;
      queuedMessages.unshift({ ...message, retry: true }); renderQueue();
    } finally {
      cancelRender();
      if (replyRender === rendering) replyRender = null;
      if (id === generation) { busy = false; activeMessage = null; request = null; controls(); drainQueue(); }
    }
  }
  function onEnter() {
    if (entered || disposed) return;
    entered = true; root.hidden = false; controls(); void status();
  }
  function onFailure() {
    entered = false;
    if (!disposed && activeMessage) queuedMessages.unshift({ ...activeMessage, retry: true });
    queuePaused = queuedMessages.length > 0;
    abort(); renderQueue(); statusRequest?.abort(); available = false;
    close({ immediate: true }); root.hidden = true; panel.hidden = true; launcher.setAttribute('aria-expanded', 'false');
  }
  function onBuilding(event) { building = event.detail?.id ? { id: event.detail.id, name: event.detail.name || event.detail.id } : null; }
  function onViewportResize() {
    if (!panel.open || closing || disposed) return;
    resizeAnimation?.cancel();
    resizeInput();
  }
  function preventMap(event) { event.stopPropagation(); }
  function onShortcut(event) {
    if (!entered || disposed || keyboard.mobile || event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.shiftKey || !event[keyboard.modifier] || event.key?.toLowerCase() !== 'k') return;
    event.preventDefault(); event.stopPropagation(); panel.open ? close() : open();
  }
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'click', 'dblclick', 'touchstart', 'touchmove', 'touchend'].forEach(name => root.addEventListener(name, preventMap));
  root.addEventListener('keydown', event => {
    onShortcut(event); event.stopPropagation();
    if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); close(); }
  });
  root.addEventListener('keyup', preventMap);
  attach.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => addFiles(fileInput.files));
  input.addEventListener('paste', event => {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length) { event.preventDefault(); void addFiles(files); }
  });
  panel.addEventListener('dragover', event => {
    if (Array.from(event.dataTransfer?.types || []).includes('Files')) { event.preventDefault(); event.stopPropagation(); }
  });
  panel.addEventListener('drop', event => {
    if (event.dataTransfer?.files?.length) { event.preventDefault(); event.stopPropagation(); void addFiles(event.dataTransfer.files); }
  });
  input.addEventListener('input', () => { resizeInput(); controls(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!event.repeat) form.requestSubmit(); }
  });
  panel.addEventListener('cancel', event => { event.preventDefault(); close(); });
  panel.addEventListener('click', event => {
    if (event.target !== panel) return;
    const rect = panel.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  launcher.addEventListener('click', () => panel.open ? close() : open());
  closeButton.addEventListener('click', close); retry.addEventListener('click', () => void status()); form.addEventListener('submit', submit);
  stop.addEventListener('click', stopRequest);
  resumeQueue.addEventListener('click', () => { if (busy || !available || !entered || disposed) return; queuePaused = false; renderQueue(); controls(); return drainQueue(); });
  clearQueue.addEventListener('click', () => { queuedMessages = []; queuePaused = false; renderQueue(); controls(); input.focus(); });
  document.addEventListener('keydown', onShortcut);
  globalThis.addEventListener?.('resize', onViewportResize);
  globalThis.visualViewport?.addEventListener('resize', onViewportResize);
  document.addEventListener('campus-enter', onEnter);
  document.addEventListener('campus-loading-failed', onFailure);
  document.addEventListener('campus-building-selected', onBuilding);
  controls();
  return Object.freeze({ open, close, dispose() {
    stopLogoAnimation();
    disposed = true; draftAttachments = []; conversation = []; queuedMessages = []; activeMessage = null; onFailure();
    document.removeEventListener('keydown', onShortcut);
    globalThis.removeEventListener?.('resize', onViewportResize);
    globalThis.visualViewport?.removeEventListener('resize', onViewportResize);
    document.removeEventListener('campus-enter', onEnter);
    document.removeEventListener('campus-loading-failed', onFailure);
    document.removeEventListener('campus-building-selected', onBuilding); root.remove();
  } });
}
