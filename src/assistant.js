import { boundedMessages, getAssistantStatus, safeSourceUrl, streamAssistant } from './chat-client.js';
const assistantLogoUrl = new URL('../assets/branding/tech-at-assistant.png', import.meta.url).href;
const assistantHoverLogoUrl = new URL('../assets/branding/tech-at-assistant-hover.svg', import.meta.url).href;

export function createAssistant({ container = document.body, getBuilding = () => null } = {}) {
  let entered = false, disposed = false, available = false, busy = false;
  let conversation = [], request, statusRequest, generation = 0, previousFocus;
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
  identity.append(logo(), el('span', '', 'Tech@NYU'), el('span', 'assistant-subtitle', 'Campus assistant'));
  const closeButton = el('button', 'assistant-icon-button', '×');
  closeButton.type = 'button'; closeButton.setAttribute('aria-label', 'Close assistant');
  header.append(identity, closeButton);
  const form = el('form', 'assistant-form');
  const label = el('label', 'assistant-input-label', 'Message'), input = el('textarea');
  input.id = 'campus-assistant-message'; label.htmlFor = input.id;
  input.rows = 1; input.maxLength = 8000; input.placeholder = 'Ask about Tech@NYU…';
  input.setAttribute('aria-describedby', 'assistant-input-hint');
  const compose = el('div', 'assistant-compose');
  const send = el('button', 'assistant-send', '↑'); send.type = 'submit'; send.setAttribute('aria-label', 'Send message');
  compose.append(input, send);
  const actions = el('div', 'assistant-actions');
  const hint = el('span', 'assistant-input-hint', '↵ Ask  ·  Shift ↵ new line'); hint.id = 'assistant-input-hint';
  const clear = el('button', 'assistant-secondary', 'Clear chat'), stop = el('button', 'assistant-secondary assistant-stop', 'Stop');
  clear.type = stop.type = 'button'; clear.hidden = stop.hidden = true;
  actions.append(hint, clear, stop); form.append(label, compose, actions);
  const footer = el('div', 'assistant-footer');
  const context = el('p', 'assistant-context');
  const connection = el('div', 'assistant-connection');
  const service = el('p', 'assistant-service', 'Checking connection…'); service.setAttribute('role', 'status');
  const retry = el('button', 'assistant-retry', 'Retry'); retry.type = 'button'; retry.hidden = true;
  connection.append(service, retry); footer.append(context, connection);
  const transcript = el('div', 'assistant-transcript'); transcript.hidden = true;
  transcript.setAttribute('role', 'log'); transcript.setAttribute('aria-label', 'Conversation'); transcript.setAttribute('aria-live', 'off');
  const announcement = el('p', 'assistant-announcement');
  announcement.setAttribute('role', 'status'); announcement.setAttribute('aria-live', 'polite');
  panel.append(header, form, footer, transcript, announcement); root.append(launcher, panel); container.append(root);

  function updateContext() { context.textContent = building?.name ? 'Selected: ' + building.name : 'Campus-wide'; }
  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight || 34, 132) + 'px';
  }
  function controls() {
    // Drafting remains possible while configuration or the network is unavailable.
    input.disabled = !entered;
    send.disabled = !entered || !available || busy || !input.value.trim();
    stop.hidden = !busy;
    clear.hidden = !transcript.children.length;
    form.setAttribute('aria-busy', String(busy));
  }
  function abort() { generation++; request?.abort(); request = null; busy = false; controls(); }
  function open() {
    if (!entered || disposed || panel.open) return;
    previousFocus = document.activeElement;
    panel.hidden = false;
    panel.showModal();
    launcher.setAttribute('aria-expanded', 'true');
    resizeInput(); input.focus();
  }
  function close() {
    if (!panel.open) return;
    // Preserve the draft and completed history; an in-flight reply stops explicitly.
    request?.abort();
    panel.close(); panel.hidden = true; launcher.setAttribute('aria-expanded', 'false');
    if (entered) (previousFocus?.isConnected && typeof previousFocus.focus === 'function' ? previousFocus : launcher).focus();
    previousFocus = null;
  }
  async function status() {
    statusRequest?.abort();
    const controller = new AbortController(); statusRequest = controller;
    available = false; controls(); service.textContent = 'Checking connection…';
    service.setAttribute('data-connected', 'false'); retry.hidden = true;
    try {
      const data = await getAssistantStatus({ signal: controller.signal });
      if (disposed || !entered || statusRequest !== controller) return;
      available = data.chat.configured && data.access.allowed;
      service.textContent = !data.access.allowed ? 'Session access required' : !data.chat.configured ? 'Assistant setup pending' : data.discord?.liveConfigured && data.discord?.liveAllowed ? 'Ready to ask · live Discord' : data.google?.configured && data.google?.allowed ? 'Ready to ask · Google' : data.miro?.configured ? 'Ready to ask · Miro' : 'Ready to ask · club sources unavailable';
      service.title = !data.access.allowed ? 'Assistant access is not available for this session.' : !data.chat.configured ? 'The assistant has not been configured on the server.' : '';
      service.setAttribute('data-connected', String(available)); retry.hidden = available;
    } catch (error) {
      if (error.name !== 'AbortError' && statusRequest === controller && entered && !disposed) {
        service.textContent = 'Assistant offline'; service.title = error.message;
        service.setAttribute('data-connected', 'false'); retry.hidden = false;
      }
    } finally { if (statusRequest === controller) controls(); }
  }
  function sources(parent, entries) {
    const list = el('ul', 'assistant-sources');
    for (const source of Array.isArray(entries) ? entries.slice(0, 12) : []) {
      const href = safeSourceUrl(source?.url); if (!href) continue;
      const li = el('li'), link = el('a', '', String(source.title || source.name || new URL(href).hostname));
      link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; li.append(link); list.append(li);
    }
    if (list.children.length) parent.append(list);
  }
  function bubble(role, text) {
    const box = el('article', 'assistant-message assistant-' + role);
    const who = el('p', 'assistant-role', role === 'user' ? 'You' : 'Tech@NYU'), content = el('p', 'assistant-message-text', text);
    box.append(who, content); transcript.append(box); transcript.hidden = false;
    while (transcript.children.length > 40) transcript.firstElementChild.remove();
    transcript.scrollTop = transcript.scrollHeight; return { box, content };
  }
  async function submit(event) {
    event.preventDefault();
    const text = input.value.trim(); if (!entered || !available || busy || !text) return;
    const id = ++generation, controller = new AbortController(); request = controller; busy = true;
    input.value = ''; resizeInput(); bubble('user', text); const reply = bubble('assistant', 'Thinking…'); controls();
    announcement.textContent = 'Assistant is responding…'; let partial = '';
    const messages = boundedMessages([...conversation, { role: 'user', content: text }]);
    try {
      const answer = await streamAssistant({ messages, buildingId: building?.id, signal: controller.signal, onEvent(event) {
        if (id !== generation) return;
        if (event.type === 'meta') sources(reply.box, event.sources);
        if (event.type === 'delta') { partial += event.text; reply.content.textContent = partial; transcript.scrollTop = transcript.scrollHeight; }
      } });
      if (id !== generation) return;
      reply.content.textContent = answer || 'The assistant returned an empty reply.';
      conversation = boundedMessages([...messages, { role: 'assistant', content: answer }]); announcement.textContent = 'Reply complete.';
    } catch (error) {
      if (id !== generation) return;
      if (!partial) reply.content.textContent = '';
      reply.box.append(el('p', 'assistant-message-error', error.name === 'AbortError' ? 'Stopped. This reply is incomplete.' : error.message));
      announcement.textContent = error.name === 'AbortError' ? 'Reply stopped.' : 'The reply could not finish.';
    } finally { if (id === generation) { busy = false; request = null; controls(); } }
  }
  function onEnter() {
    if (entered || disposed) return;
    entered = true; root.hidden = false; updateContext(); controls(); void status();
  }
  function onFailure() {
    entered = false; abort(); statusRequest?.abort(); available = false;
    close(); root.hidden = true; panel.hidden = true; launcher.setAttribute('aria-expanded', 'false');
  }
  function onBuilding(event) { building = event.detail?.id ? { id: event.detail.id, name: event.detail.name || event.detail.id } : null; updateContext(); }
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
  stop.addEventListener('click', () => request?.abort());
  clear.addEventListener('click', () => {
    abort(); conversation = []; transcript.replaceChildren(); transcript.hidden = true; controls();
    announcement.textContent = 'Conversation cleared.'; if (!input.disabled) input.focus();
  });
  document.addEventListener('keydown', onShortcut);
  document.addEventListener('campus-enter', onEnter);
  document.addEventListener('campus-loading-failed', onFailure);
  document.addEventListener('campus-building-selected', onBuilding);
  updateContext(); controls();
  return Object.freeze({ open, close, dispose() {
    stopLogoAnimation();
    disposed = true; onFailure();
    document.removeEventListener('keydown', onShortcut);
    document.removeEventListener('campus-enter', onEnter);
    document.removeEventListener('campus-loading-failed', onFailure);
    document.removeEventListener('campus-building-selected', onBuilding); root.remove();
  } });
}
