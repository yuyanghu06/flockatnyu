export const CONTACT_FIELD_LIMITS = Object.freeze({
  first_name: 200,
  last_name: 200,
  email: 320,
  phone_number: 100,
  workplace: 500,
  notes: 4000,
});
export const SAMPLE_CONTACTS = [
  {
    first_name: 'Avery',
    last_name: 'Chen',
    email: 'avery@example.com',
    phone_number: '+1 (212) 555-0101',
    workplace: 'Northstar Labs',
    notes:
      'Met at a design meetup. Interested in community projects and thoughtful product design.',
  },
  {
    first_name: 'Jordan',
    last_name: 'Lee',
    email: 'jordan@example.com',
    phone_number: '+1 (212) 555-0102',
    workplace: 'Fieldwork Studio',
    notes: 'Enjoys working on small teams. Follow up about the portfolio conversation.',
  },
  {
    first_name: 'Sam',
    last_name: 'Rivera',
    email: 'sam@example.com',
    phone_number: '+1 (212) 555-0103',
    workplace: 'Atlas Systems',
    notes: 'Ask about their latest side project the next time we catch up.',
  },
  {
    first_name: 'Taylor',
    last_name: 'Brooks',
    email: 'taylor@example.com',
    phone_number: '+1 (212) 555-0104',
    workplace: 'Cedar Design',
    notes: 'Shared a few helpful ideas about making events more welcoming.',
  },
  {
    first_name: 'Morgan',
    last_name: 'Park',
    email: 'morgan@example.com',
    phone_number: '+1 (212) 555-0105',
    workplace: 'Harbor Research',
    notes: 'Interested in research, mentoring, and meeting other builders.',
  },
  {
    first_name: 'Casey',
    last_name: 'Kim',
    email: 'casey@example.com',
    phone_number: '+1 (212) 555-0106',
    workplace: 'Common Ground',
    notes: 'Good person to talk with about collaboration and creative workshops.',
  },
  {
    first_name: 'Riley',
    last_name: 'Patel',
    email: 'riley@example.com',
    phone_number: '+1 (212) 555-0107',
    workplace: 'Maple Labs',
    notes: 'Met over coffee. Would like to hear more about their upcoming work.',
  },
  {
    first_name: 'Jamie',
    last_name: 'Diaz',
    email: 'jamie@example.com',
    phone_number: '+1 (212) 555-0108',
    workplace: 'Brightside Studio',
    notes: 'Interested in early-stage ideas and learning from other designers.',
  },
  {
    first_name: 'Alex',
    last_name: 'Morgan',
    email: 'alex@example.com',
    phone_number: '+1 (212) 555-0109',
    workplace: 'Openfield',
    notes: 'Enjoyed the conversation about accessible tools for everyday work.',
  },
  {
    first_name: 'Drew',
    last_name: 'Wilson',
    email: 'drew@example.com',
    phone_number: '+1 (212) 555-0110',
    workplace: 'Daybreak Works',
    notes: 'Check in about a possible future collaboration.',
  },
  {
    first_name: 'Skyler',
    last_name: 'Jones',
    email: 'skyler@example.com',
    phone_number: '+1 (212) 555-0111',
    workplace: 'Riverside Collective',
    notes: 'Likes connecting people across different creative backgrounds.',
  },
  {
    first_name: 'Cameron',
    last_name: 'Reed',
    email: 'cameron@example.com',
    phone_number: '+1 (212) 555-0112',
    workplace: 'North Loop',
    notes: 'Keep in touch about their next community gathering.',
  },
];
export const sampleId = (index) => `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
export const normalizeExample = (value) =>
  value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
export function exampleDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
    }
  return matrix[a.length][b.length];
}
export function exampleScore(text, query) {
  const haystack = normalizeExample(text),
    needle = normalizeExample(query).trim();
  if (!needle) return 0;
  if (haystack.includes(needle)) return 100;
  const words = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean),
    tokens = needle.split(/\s+/u).filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 10;
      continue;
    }
    if (token.length < 3 || token.length > 64) return -1;
    const distance = Math.min(
      ...words
        .filter((word) => Math.abs(word.length - token.length) <= 2 && word.length <= 64)
        .map((word) => exampleDistance(token, word)),
    );
    if (distance > (token.length >= 6 ? 2 : 1)) return -1;
    score += 6 - distance;
  }
  return score;
}
export function createMockContactsClient() {
  let revision = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 26, 16) + ++revision).toISOString();
  let rows = SAMPLE_CONTACTS.map((fields, index) => {
    const time = stamp();
    return { id: sampleId(index), created_at: time, updated_at: time, fields: { ...fields } };
  });
  const copy = (value) => structuredClone(value);
  const valid = (fields) =>
    fields &&
    typeof fields === 'object' &&
    !Array.isArray(fields) &&
    Object.keys(fields).length > 0 &&
    Object.entries(fields).every(
      ([key, value]) =>
        Object.hasOwn(CONTACT_FIELD_LIMITS, key) &&
        typeof value === 'string' &&
        value.length <= CONTACT_FIELD_LIMITS[key],
    );
  return Object.freeze({
    async search({
      query = '',
      limit = 10,
      offset = 0,
      name = '',
      workplace = '',
      emailPresence = 'any',
      phonePresence = 'any',
      sort = 'auto',
      signal,
    } = {}) {
      if (signal?.aborted) return { status: 'aborted' };
      const present = (value, choice) =>
        choice === 'any' || Boolean(value.trim()) === (choice === 'yes');
      const scored = rows
        .map((row) => ({
          row,
          score: exampleScore(Object.values(row.fields).join(' '), query),
          nameScore: exampleScore(`${row.fields.first_name} ${row.fields.last_name}`, name),
          workplaceScore: exampleScore(row.fields.workplace, workplace),
        }))
        .filter(
          (item) =>
            item.score >= 0 &&
            item.nameScore >= 0 &&
            item.workplaceScore >= 0 &&
            present(item.row.fields.email, emailPresence) &&
            present(item.row.fields.phone_number, phonePresence),
        );
      const effectiveSort = sort === 'auto' ? (query.trim() ? 'relevance' : 'newest') : sort;
      scored.sort((a, b) => {
        const names = `${a.row.fields.first_name} ${a.row.fields.last_name}`.localeCompare(
          `${b.row.fields.first_name} ${b.row.fields.last_name}`,
          undefined,
          { sensitivity: 'base' },
        );
        const order =
          effectiveSort === 'name_asc'
            ? names
            : effectiveSort === 'name_desc'
              ? -names
              : effectiveSort === 'oldest'
                ? a.row.created_at.localeCompare(b.row.created_at)
                : effectiveSort === 'relevance' && query.trim()
                  ? b.score - a.score
                  : b.row.created_at.localeCompare(a.row.created_at);
        return order || a.row.id.localeCompare(b.row.id);
      });
      const matches = scored.map((item) => item.row),
        contacts = matches.slice(offset, offset + limit),
        next = offset + contacts.length;
      return copy({
        status: 'ready',
        contacts,
        coverage: {
          complete: next >= matches.length,
          nextOffset: next < matches.length ? next : null,
        },
      });
    },
    async read({ contactId, signal } = {}) {
      if (signal?.aborted) return { status: 'aborted' };
      const contact = rows.find((row) => row.id === contactId);
      return contact ? copy({ status: 'ready', contact }) : { status: 'not_found' };
    },
    async create({ fields, signal } = {}) {
      if (signal?.aborted) return { status: 'aborted' };
      if (!valid(fields) || !Object.values(fields).some((value) => value.trim()))
        return { status: 'invalid_request' };
      const time = stamp(),
        contact = {
          id: crypto.randomUUID(),
          created_at: time,
          updated_at: time,
          fields: Object.fromEntries(
            Object.keys(CONTACT_FIELD_LIMITS).map((key) => [key, fields[key] ?? '']),
          ),
        };
      rows.unshift(contact);
      return copy({
        status: 'ready',
        contact,
        contactWrite: { operation: 'created', id: contact.id, updated_at: contact.updated_at },
      });
    },
    async update({ contactId, expectedUpdatedAt, fields, signal } = {}) {
      if (signal?.aborted) return { status: 'aborted' };
      if (!valid(fields)) return { status: 'invalid_request' };
      const contact = rows.find((row) => row.id === contactId);
      if (!contact) return { status: 'not_found' };
      if (contact.updated_at !== expectedUpdatedAt) return { status: 'conflict' };
      contact.fields = { ...contact.fields, ...fields };
      contact.updated_at = stamp();
      return copy({
        status: 'ready',
        contact,
        contactWrite: { operation: 'updated', id: contact.id, updated_at: contact.updated_at },
      });
    },
    async delete({ contactId, expectedUpdatedAt, signal } = {}) {
      if (signal?.aborted) return { status: 'aborted' };
      const contact = rows.find((row) => row.id === contactId);
      if (!contact) return { status: 'not_found' };
      if (contact.updated_at !== expectedUpdatedAt) return { status: 'conflict' };
      rows = rows.filter((row) => row.id !== contactId);
      return {
        status: 'ready',
        contactWrite: { operation: 'deleted', id: contact.id, updated_at: contact.updated_at },
      };
    },
  });
}
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
export function filterIcon() {
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS(ns, 'defs'),
    gradient = document.createElementNS(ns, 'linearGradient');
  const gradientId = 'contacts-mock-filter-gradient-' + ++filterIconSequence;
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
