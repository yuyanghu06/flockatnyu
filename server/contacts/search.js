import { plainObject } from '../automation/validation.js';

export const CONTACT_SEARCH_PRESENCE = Object.freeze(['any', 'yes', 'no']);
export const CONTACT_SEARCH_SORTS = Object.freeze([
  'auto',
  'relevance',
  'name_asc',
  'name_desc',
  'newest',
  'oldest',
]);
export const CONTACT_SEARCH_PROPERTIES = Object.freeze({
  query: { type: 'string', maxLength: 256 },
  limit: { type: 'integer', minimum: 1, maximum: 10 },
  offset: { type: 'integer', minimum: 0, maximum: 10000 },
  name: { type: 'string', maxLength: 200 },
  workplace: { type: 'string', maxLength: 500 },
  emailPresence: { type: 'string', enum: CONTACT_SEARCH_PRESENCE },
  phonePresence: { type: 'string', enum: CONTACT_SEARCH_PRESENCE },
  sort: { type: 'string', enum: CONTACT_SEARCH_SORTS },
});
const text = (value, max) =>
  typeof value === 'string' && value.length <= max && !value.includes('\0');
export function validContactsSearchOptions(value) {
  if (
    !plainObject(value) ||
    Object.keys(value).some(
      (key) => !Object.hasOwn(CONTACT_SEARCH_PROPERTIES, key) && key !== 'signal',
    )
  )
    return false;
  const {
    query = '',
    limit = 5,
    offset = 0,
    name = '',
    workplace = '',
    emailPresence = 'any',
    phonePresence = 'any',
    sort = 'auto',
  } = value;
  return (
    text(query, 256) &&
    text(name, 200) &&
    text(workplace, 500) &&
    Number.isSafeInteger(limit) &&
    limit >= 1 &&
    limit <= 10 &&
    Number.isSafeInteger(offset) &&
    offset >= 0 &&
    offset <= 10000 &&
    CONTACT_SEARCH_PRESENCE.includes(emailPresence) &&
    CONTACT_SEARCH_PRESENCE.includes(phonePresence) &&
    CONTACT_SEARCH_SORTS.includes(sort)
  );
}

// The POST invokes one read-only SQL function, never a contact write or a
// provider lookup. The database ranks/filters the full saved table before paging.
export function createContactsSearch({ request } = {}) {
  return async function search(options = {}) {
    if (!validContactsSearchOptions(options)) return { status: 'invalid_request' };
    const {
      query = '',
      limit = 5,
      offset = 0,
      name = '',
      workplace = '',
      emailPresence = 'any',
      phonePresence = 'any',
      sort = 'auto',
      signal,
    } = options;
    const result = await request({
      method: 'POST',
      resource: 'rpc/contacts_search',
      readOnly: true,
      signal,
      body: {
        p_query: query,
        p_limit: limit,
        p_offset: offset,
        p_name: name,
        p_workplace: workplace,
        p_email_presence: emailPresence,
        p_phone_presence: phonePresence,
        p_sort: sort,
      },
    });
    if (result.status !== 'ready') return result;
    if (result.rows.length > limit + 1) return { status: 'invalid_response' };
    const more = result.rows.length > limit;
    return {
      status: 'ready',
      contacts: result.rows.slice(0, limit),
      coverage: {
        complete: !more,
        nextOffset: more && offset + limit <= 10000 ? offset + limit : null,
      },
    };
  };
}
