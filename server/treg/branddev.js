import { plainObject } from '../automation/validation.js';

const responseLimit = 512_000;
const text = (value) =>
  value === null || (typeof value === 'string' && value.length <= responseLimit);
const canonicalDomain = (value) => value.toLowerCase().replace(/^www\./, '');

// Callers validate every supplied field before selecting one native identifier.
// Selection does not discover another company or derive a domain from an email.
export function brandDevRequest(input) {
  let service = 'branddev.brand.retrieve',
    key,
    value;
  if (input.domain) {
    key = 'domain';
    value = canonicalDomain(input.domain);
  } else if (input.website) {
    key = 'domain';
    value = canonicalDomain(new URL(input.website).hostname);
  } else if (input.email) {
    service = 'branddev.brand.retrieve-by-email';
    key = 'email';
    value = input.email;
  } else if (input.name && input.name.length >= 3) {
    service = 'branddev.brand.retrieve-by-name';
    key = 'name';
    value = input.name;
  } else return null;
  const endpoint = new URL(`https://treg.to/call/${service}`);
  endpoint.searchParams.set(key, value);
  return { service, endpoint: endpoint.href, method: 'GET', body: null, input: { [key]: value } };
}

function employees(value) {
  if (value === null) return { employees: null };
  if (!plainObject(value)) return null;
  const hasExact = Object.hasOwn(value, 'exact'),
    hasRange = Object.hasOwn(value, 'range');
  if (hasExact && value.exact !== null && (!Number.isSafeInteger(value.exact) || value.exact < 0))
    return null;
  if (hasRange && !text(value.range)) return null;
  const exact = hasExact && value.exact !== null ? String(value.exact) : null;
  const range = hasRange && value.range !== null ? value.range : null;
  if (exact !== null && range !== null) return { employees: `exact: ${exact}; range: ${range}` };
  if (exact !== null || range !== null) return { employees: exact ?? range };
  return hasExact || hasRange ? { employees: null } : {};
}

function industry(value) {
  if (value === null) return { industry: null };
  if (!plainObject(value)) return null;
  if (!Object.hasOwn(value, 'eic')) return {};
  if (value.eic === null) return { industry: null };
  if (!Array.isArray(value.eic)) return null;
  const names = [],
    nulls = [];
  for (const item of value.eic) {
    if (!plainObject(item)) return null;
    if (!Object.hasOwn(item, 'industry')) continue;
    if (!text(item.industry)) return null;
    if (item.industry === null) nulls.push(true);
    else names.push(item.industry);
  }
  return names.length
    ? { industry: [...new Set(names)].join('; ') }
    : nulls.length
      ? { industry: null }
      : {};
}

function location(value) {
  if (value === null) return { location: null };
  if (!plainObject(value)) return null;
  const parts = [],
    nulls = [];
  for (const key of ['city', 'state_province', 'country']) {
    if (!Object.hasOwn(value, key)) continue;
    if (!text(value[key])) return null;
    if (value[key] === null) nulls.push(true);
    else parts.push(value[key]);
  }
  return parts.length ? { location: parts.join(', ') } : nulls.length ? { location: null } : {};
}

function socials(value) {
  if (value === null) return { linkedin_url: null };
  if (!Array.isArray(value)) return null;
  const urls = [],
    nulls = [];
  for (const item of value) {
    if (!plainObject(item) || (Object.hasOwn(item, 'type') && !text(item.type))) return null;
    if (typeof item.type !== 'string' || item.type.toLowerCase() !== 'linkedin') continue;
    if (!Object.hasOwn(item, 'url')) continue;
    if (!text(item.url)) return null;
    if (item.url === null) nulls.push(true);
    else {
      try {
        const url = new URL(item.url);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          !['linkedin.com', 'www.linkedin.com'].includes(url.hostname) ||
          url.username ||
          url.password
        )
          return null;
      } catch {
        return null;
      }
      urls.push(item.url);
    }
  }
  const unique = [...new Set(urls)];
  return unique.length === 1
    ? { linkedin_url: unique[0] }
    : unique.length
      ? {}
      : nulls.length
        ? { linkedin_url: null }
        : {};
}

// Build a separate bounded response projection. The complete native response is
// retained by the caller's private logger and is never modified here.
export function projectBrandDevOutput(body) {
  if (!plainObject(body) || body.status !== 'ok' || !plainObject(body.brand)) return null;
  const brand = body.brand,
    output = {};
  for (const [source, target] of [
    ['title', 'name'],
    ['domain', 'domain'],
    ['description', 'description'],
  ]) {
    if (!Object.hasOwn(brand, source)) continue;
    if (!text(brand[source])) return null;
    output[target] = brand[source];
  }
  for (const [key, project] of [
    ['employees', employees],
    ['industries', industry],
    ['address', location],
    ['socials', socials],
  ]) {
    if (!Object.hasOwn(brand, key)) continue;
    const fields = project(brand[key]);
    if (fields === null) return null;
    Object.assign(output, fields);
  }
  return output;
}
