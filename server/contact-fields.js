import { plainObject } from './automation/validation.js';

export const CONTACT_FIELDS = Object.freeze({ first_name: 200, last_name: 200, email: 320, phone_number: 100, workplace: 500, notes: 4000 });

// Project only explicit values from one Exa person. Neither the source row nor
// its keys are changed, and ambiguous names/current employers stay unavailable.
export function exaContactFields(raw) {
  if (!plainObject(raw) || !Array.isArray(raw.entities)) return {};
  const people = raw.entities.filter(entity => plainObject(entity) && entity.type === 'person');
  if (people.length !== 1 || !plainObject(people[0].properties)) return {};
  const properties = people[0].properties;
  const current = Array.isArray(properties.workHistory) ? properties.workHistory.filter(job => plainObject(job)
    && plainObject(job.dates) && job.dates.to === null) : [];
  const candidates = { first_name: properties.firstName, last_name: properties.lastName,
    workplace: current.length === 1 && plainObject(current[0].company) ? current[0].company.name : undefined };
  return Object.fromEntries(Object.entries(candidates).filter(([, value]) => typeof value === 'string'));
}

// Raw provider values remain unchanged; manual top-level fields (including
// clears) always win over native person/Exa values and the lookup-email fallback.
export function contactFields(contact) {
  const raw = plainObject(contact?.raw_input) ? contact.raw_input : {};
  const person = (!Object.hasOwn(raw, 'found') || raw.found === true) && plainObject(raw.person) ? raw.person : {};
  const exa = exaContactFields(raw);
  return Object.fromEntries(Object.entries(CONTACT_FIELDS).map(([field, limit]) => {
    const value = Object.hasOwn(raw, field) ? raw[field]
      : typeof person[field] === 'string' ? person[field]
        : typeof exa[field] === 'string' ? exa[field]
          : field === 'email' ? contact?.lookup_email : undefined;
    return [field, typeof value === 'string' && value.length <= limit ? value : ''];
  }));
}
