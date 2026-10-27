export const labels = {
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone_number: 'Phone',
  workplace: 'Workplace',
  notes: 'Notes',
};
export const keys = Object.keys(labels);
export const emptyFields = () => Object.fromEntries(keys.map((key) => [key, '']));
export const nameOf = (contact) =>
  [contact.fields.first_name, contact.fields.last_name].filter(Boolean).join(' ') ||
  contact.fields.email ||
  contact.fields.workplace ||
  'Unnamed contact';
export const initialsOf = (contact) =>
  [contact.fields.first_name, contact.fields.last_name]
    .filter(Boolean)
    .map((text) => Array.from(text.trim())[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '·';
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function button(className, text, action) {
  const node = el('button', className, text);
  node.type = 'button';
  if (action) node.addEventListener('click', action);
  return node;
}
export function icon(kind = 'book') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    width: '20',
    height: '20',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.6',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }))
    node.setAttribute(key, value);
  const paths =
    kind === 'search'
      ? ['M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z', 'm16 16 4 4']
      : kind === 'plus'
        ? ['M12 5v14M5 12h14']
        : kind === 'back'
          ? ['m14 6-6 6 6 6']
          : kind === 'refresh'
            ? ['M20 4v5h-5', 'M20 9a8 8 0 1 0 .1 5']
            : [
                'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6V3Z',
                'M3 7h4M3 12h4M3 17h4',
                'M13 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
                'M10 17v-1a3 3 0 0 1 6 0v1',
              ];
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    node.append(path);
  }
  return node;
}
export const defaultFilters = () => ({
  name: '',
  workplace: '',
  emailPresence: 'any',
  phonePresence: 'any',
  sort: 'auto',
});
export let filterIconSequence = 0;
export let editorFormSequence = 0;
export function filterIcon() {
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS(ns, 'defs'),
    gradient = document.createElementNS(ns, 'linearGradient');
  const gradientId = 'contacts-filter-gradient-' + ++filterIconSequence;
  gradient.id = gradientId;
  for (const [key, value] of Object.entries({ x1: '0%', y1: '0%', x2: '95%', y2: '100%' }))
    gradient.setAttribute(key, value);
  for (const [offset, color] of [
    ['0%', '#f0ba72'],
    ['20%', '#f3a4b8'],
    ['42%', '#d59bea'],
    ['63%', '#8faff0'],
    ['83%', '#82d2d2'],
    ['100%', '#a5d6a3'],
  ]) {
    const stop = document.createElementNS(ns, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    gradient.append(stop);
  }
  defs.append(gradient);
  const funnel = document.createElementNS(ns, 'path');
  funnel.setAttribute(
    'd',
    'M4.2 4.5h15.6c.7 0 1.1.8.6 1.4L14 13.2v5.4c0 .4-.2.7-.6.9l-2.6 1.1c-.5.2-1.1-.2-1.1-.8v-6.6L3.6 5.9c-.5-.6-.1-1.4.6-1.4Z',
  );
  funnel.setAttribute('class', 'contacts-filter-shape');
  funnel.setAttribute('fill', 'none');
  funnel.setAttribute('stroke', `url(#${gradientId})`);
  funnel.setAttribute('stroke-width', '1.7');
  funnel.setAttribute('stroke-linejoin', 'round');
  funnel.style.setProperty('--contacts-funnel-fill', `url(#${gradientId})`);
  const highlight = document.createElementNS(ns, 'path');
  highlight.setAttribute('class', 'contacts-filter-highlight');
  highlight.setAttribute('d', 'M5.3 5.4h13.4l-1.2 1.4H6.5Z');
  highlight.setAttribute('fill', '#ffffff66');
  svg.append(defs, funnel, highlight);
  return svg;
}
export function messageFor(result, action = 'load contacts') {
  if (result?.reason === 'write_outcome_unknown')
    return 'The change wasn’t confirmed. Check the saved contacts before trying again.';
  if (result?.status === 'forbidden')
    return 'Contacts aren’t available with your current access. Sign in again, then retry.';
  if (result?.status === 'conflict')
    return 'This contact changed since you opened it. Reload the saved contact, then review your changes.';
  if (result?.status === 'not_found')
    return 'This contact is no longer available. Refresh the list to see the latest contacts.';
  if (result?.status === 'invalid_request') return 'Check the contact details and try again.';
  if (result?.status === 'rate_limited') return 'Please wait a moment, then try again.';
  return `Couldn’t ${action}. Your changes are still here. Check your connection and retry.`;
}

export function nextEditorFormId() {
  return ++editorFormSequence;
}
