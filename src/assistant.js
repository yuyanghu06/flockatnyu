import { boundedMessages, getAssistantStatus, safeSourceUrl, streamAssistant } from './chat-client.js';
import { renderAssistantMarkdown } from './assistant-markdown.js';
const assistantLogoUrl = new URL('../assets/branding/tech-at-assistant.png', import.meta.url).href;
const assistantHoverLogoUrl = new URL('../assets/branding/tech-at-assistant-hover.svg', import.meta.url).href;

export function createAssistant({ container = document.body, getBuilding = () => null } = {}) {
  let entered = false, disposed = false, available = false, busy = false;
  let conversation = [], request, statusRequest, generation = 0, previousFocus, replyRender;
  let closing = false, closeTimer;
  let resizeAnimation, resizeFrame = 0, resizeFrom;
  let followFrame = 0;
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
  launcher.setAttribute('aria-keyshortcuts', 'Meta+K Control+K');
  const shortcut = el('kbd', 'assistant-shortcut', '⌘ / Ctrl K');
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
  header.append(identity, closeButton);
  const form = el('form', 'assistant-form');
  const label = el('label', 'assistant-input-label', 'Message'), input = el('textarea');
  input.id = 'campus-assistant-message'; label.htmlFor = input.id;
  input.rows = 1; input.maxLength = 8000; input.placeholder = 'Ask about Tech@NYU…';
  const compose = el('div', 'assistant-compose');
  const send = el('button', 'assistant-send', '↑'); send.type = 'submit'; send.setAttribute('aria-label', 'Send message');
  compose.append(input, send);
  form.append(label, compose);
  const connection = el('div', 'assistant-connection');
  const service = el('p', 'assistant-service', 'Checking connection…'); service.setAttribute('role', 'status');
  const retry = el('button', 'assistant-retry', 'Retry'); retry.type = 'button'; retry.hidden = true;
  connection.hidden = true;
  connection.append(service, retry); form.append(connection);
  const transcript = el('div', 'assistant-transcript'); transcript.hidden = true;
  transcript.setAttribute('role', 'log'); transcript.setAttribute('aria-label', 'Conversation'); transcript.setAttribute('aria-live', 'off');
  const announcement = el('p', 'assistant-announcement');
  announcement.setAttribute('role', 'status'); announcement.setAttribute('aria-live', 'polite');
  panel.append(header, form, transcript, announcement); root.append(launcher, panel); container.append(root);

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
    if (follow) followLatest();
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
    const follow = transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop < 2;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight || 34, 132) + 'px';
    queueResize(height, follow);
  }
  function controls() {
    // Drafting remains possible while configuration or the network is unavailable.
    input.disabled = !entered;
    send.disabled = !entered || (!busy && (!available || !input.value.trim()));
    send.type = busy ? 'button' : 'submit';
    send.textContent = busy ? '■' : '↑';
    send.className = busy ? 'assistant-send is-stopping' : 'assistant-send';
    send.setAttribute('aria-label', busy ? 'Stop generating' : 'Send message');
    form.setAttribute('aria-busy', String(busy));
  }
  function stopRequest() { replyRender?.flush(); request?.abort(); }
  function abort() {
    if (disposed) replyRender?.cancel(); else replyRender?.flush();
    replyRender = null; generation++; request?.abort(); request = null; busy = false; controls();
  }
  function open() {
    if (!entered || disposed) return;
    if (closing) { clearTimeout(closeTimer); closing = false; panel.classList.remove('is-closing'); input.focus(); return; }
    if (panel.open) return;
    previousFocus = document.activeElement;
    panel.hidden = false;
    panel.showModal();
    launcher.setAttribute('aria-expanded', 'true');
    resizeInput(); input.focus();
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
    // Abort immediately, but retain the native backdrop during the exit motion.
    stopRequest();
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
    } finally { if (statusRequest === controller) controls(); }
  }
  function sources(parent, entries, resize = true) {
    const height = resize ? panel.getBoundingClientRect().height : 0;
    const list = el('ul', 'assistant-sources');
    for (const source of Array.isArray(entries) ? entries.slice(0, 12) : []) {
      const href = safeSourceUrl(source?.url); if (!href) continue;
      const li = el('li'), link = el('a', '', String(source.title || source.name || new URL(href).hostname));
      link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; li.append(link); list.append(li);
    }
    if (list.children.length) { parent.append(list); if (resize) queueResize(height, true); }
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
    if (resize) queueResize(height, true);
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
  async function submit(event) {
    event.preventDefault();
    const text = input.value.trim(); if (!entered || !available || busy || !text) return;
    const id = ++generation, controller = new AbortController(); request = controller; busy = true;
    input.value = ''; resizeInput(); bubble('user', text); const reply = bubble('assistant', 'Thinking…'); controls();
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
      for (const event of events) {
        if (event.type === 'tool') updateTool(reply, event, false);
        if (event.type === 'meta') sources(reply.box, event.sources, false);
      }
      events = [];
      if (text || finalText !== undefined) renderReply(reply, text);
      renderedPartial = text;
      queueResize(height, true);
    };
    const rendering = { flush, cancel: cancelRender }; replyRender = rendering;
    const messages = boundedMessages([...conversation, { role: 'user', content: text }]);
    try {
      const answer = await streamAssistant({ messages, buildingId: building?.id, signal: controller.signal, onEvent(event) {
        if (disposed || id !== generation || controller.signal.aborted) return;
        if (event.type === 'done') { flush(partial || 'The assistant returned an empty reply.'); return; }
        if (event.type === 'delta') partial += event.text;
        else if (event.type === 'tool' || event.type === 'meta') events.push(event);
        else return;
        if (!renderFrame) {
          if (typeof requestAnimationFrame === 'function') renderFrame = requestAnimationFrame(() => flush());
          else flush();
        }
      } });
      if (disposed || id !== generation) return;
      flush(answer || 'The assistant returned an empty reply.');
      settleTools(reply, 'interrupted');
      conversation = boundedMessages([...messages, { role: 'assistant', content: answer }]); announcement.textContent = 'Reply complete.';
    } catch (error) {
      if (disposed || id !== generation) return;
      flush();
      settleTools(reply, error.name === 'AbortError' ? 'cancelled' : 'failed');
      const height = panel.getBoundingClientRect().height;
      reply.content.classList.remove('is-thinking');
      if (!partial) reply.content.textContent = '';
      reply.box.append(el('p', 'assistant-message-error', error.name === 'AbortError' ? 'Stopped. This reply is incomplete.' : error.message));
      queueResize(height, true);
      announcement.textContent = error.name === 'AbortError' ? 'Reply stopped.' : 'The reply could not finish.';
    } finally {
      cancelRender();
      if (replyRender === rendering) replyRender = null;
      if (id === generation) { busy = false; request = null; controls(); }
    }
  }
  function onEnter() {
    if (entered || disposed) return;
    entered = true; root.hidden = false; controls(); void status();
  }
  function onFailure() {
    entered = false; abort(); statusRequest?.abort(); available = false;
    close({ immediate: true }); root.hidden = true; panel.hidden = true; launcher.setAttribute('aria-expanded', 'false');
  }
  function onBuilding(event) { building = event.detail?.id ? { id: event.detail.id, name: event.detail.name || event.detail.id } : null; }
  function preventMap(event) { event.stopPropagation(); }
  function onShortcut(event) {
    if (!entered || disposed || event.isComposing || event.repeat || event.altKey || !(event.metaKey || event.ctrlKey) || event.key?.toLowerCase() !== 'k') return;
    event.preventDefault(); event.stopPropagation(); panel.open ? close() : open();
  }
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'click', 'dblclick', 'touchstart', 'touchmove', 'touchend'].forEach(name => root.addEventListener(name, preventMap));
  root.addEventListener('keydown', event => {
    onShortcut(event); event.stopPropagation();
    if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); close(); }
  });
  root.addEventListener('keyup', preventMap);
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
  send.addEventListener('click', event => { if (busy) { event.preventDefault(); stopRequest(); } });
  document.addEventListener('keydown', onShortcut);
  document.addEventListener('campus-enter', onEnter);
  document.addEventListener('campus-loading-failed', onFailure);
  document.addEventListener('campus-building-selected', onBuilding);
  controls();
  return Object.freeze({ open, close, dispose() {
    stopLogoAnimation();
    disposed = true; onFailure();
    document.removeEventListener('keydown', onShortcut);
    document.removeEventListener('campus-enter', onEnter);
    document.removeEventListener('campus-loading-failed', onFailure);
    document.removeEventListener('campus-building-selected', onBuilding); root.remove();
  } });
}
