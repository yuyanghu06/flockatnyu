import { createHash } from 'node:crypto';
import { canonicalJson, plainObject } from '../automation/validation.js';
import { CONTACT_FIELDS } from '../contacts/store.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const clean = (value, max) =>
  // eslint-disable-next-line no-control-regex -- Reject untrusted ASCII control characters.
  typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
    ? value.trim()
    : '';
const emailOf = (value) => {
  const email = clean(value, CONTACT_FIELDS.email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};
const linkedinOf = (value) => {
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      ['linkedin.com', 'www.linkedin.com'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      /^\/in\/[a-zA-Z0-9_%.-]+\/?$/.test(url.pathname)
    )
      return `https://www.linkedin.com${url.pathname.replace(/\/$/, '').toLowerCase()}`;
  } catch {}
  return '';
};

function normalizePerson(person, provider) {
  let source = person,
    workplace = person.workplace,
    email = person.email,
    phone = person.phone_number;
  let linkedin = linkedinOf(person.linkedin_url) || linkedinOf(person.linkedin);
  let knownProvider = false;
  if (provider.startsWith('aiark.')) {
    knownProvider = true;
    source = plainObject(person.profile) ? person.profile : {};
    workplace = person.company?.name;
    linkedin = linkedinOf(person.link?.linkedin);
  } else if (provider.startsWith('apollo.')) {
    knownProvider = true;
    workplace = person.organization?.name;
  } else if (provider.startsWith('hunter.')) {
    knownProvider = true;
    email = person.value;
  } else if (provider.startsWith('exa.')) {
    knownProvider = true;
    const entities = Array.isArray(person.entities)
      ? person.entities.filter(
          (entity) => entity?.type === 'person' && plainObject(entity.properties),
        )
      : [];
    if (entities.length !== 1) return null;
    const properties = entities[0].properties;
    source = { first_name: properties.firstName, last_name: properties.lastName };
    const current = Array.isArray(properties.workHistory)
      ? properties.workHistory.filter(
          (job) =>
            plainObject(job) &&
            plainObject(job.dates) &&
            job.dates.to === null &&
            plainObject(job.company),
        )
      : [];
    workplace = current.length === 1 ? current[0].company.name : undefined;
    linkedin = linkedinOf(person.url);
  }
  const fields = {
    first_name: clean(source.first_name, CONTACT_FIELDS.first_name),
    last_name: clean(source.last_name, CONTACT_FIELDS.last_name),
    email: emailOf(email),
    phone_number: clean(phone, CONTACT_FIELDS.phone_number),
    workplace: clean(workplace, CONTACT_FIELDS.workplace),
    notes: '',
  };
  // Names alone cannot distinguish people. Provider-native ids are acceptable
  // only in formats we recognize; arbitrary unknown objects are not contacts.
  const nativeId =
    knownProvider && (typeof person.id === 'string' || Number.isSafeInteger(person.id))
      ? clean(String(person.id), 500)
      : '';
  const identity = fields.email
    ? `email:${fields.email.toLowerCase()}`
    : linkedin
      ? `linkedin:${linkedin}`
      : nativeId
        ? `provider:${provider.split('.')[0]}:${nativeId}`
        : '';
  if (
    !identity ||
    ![fields.first_name, fields.last_name, fields.email, fields.phone_number].some(Boolean)
  )
    return null;
  return { contactId: contactIdFor(identity), fields };
}
function contactIdFor(identity) {
  const digest = hash(`flockatnyu:treg-contact:v1:${identity}`).slice(0, 32).split('');
  digest[12] = '8';
  digest[16] = ((parseInt(digest[16], 16) & 3) | 8).toString(16);
  const hex = digest.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
// Identity is derived separately; this never rewrites the original person.
export function tregContactIdentity(person, provider, lookupEmail) {
  const known = normalizePerson(person, provider);
  const email =
    lookupEmail || known?.fields.email || emailOf(person?.email) || emailOf(person?.person?.email);
  return {
    contactId: email
      ? contactIdFor(`email:${email.toLowerCase()}`)
      : known?.contactId || contactIdFor(`raw:${provider}:${canonicalJson(person)}`),
    email,
    ...(lookupEmail ? { lookupEmail } : {}),
  };
}
