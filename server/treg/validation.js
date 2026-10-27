import { plainObject } from '../automation/validation.js';

export const personLimit = 32_000;
const queryStrings = {
  q: 1000,
  company_domain: 253,
  title: 200,
  full_name: 400,
  country: 100,
  location: 300,
};
export const label = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);
export const actorAllowed = (actor) =>
  typeof actor?.id === 'string' &&
  actor.id.trim().length > 0 &&
  actor.id.length <= 512 &&
  Array.isArray(actor.allowedSourceIds);
export function readTregPeopleConfig(env = process.env) {
  const token = typeof env.TREG_TOKEN === 'string' ? env.TREG_TOKEN.trim() : '';
  const org = typeof env.TREG_ORG === 'string' ? env.TREG_ORG.trim() : '';
  const cost =
    env.TREG_MAX_COST_USD === undefined || env.TREG_MAX_COST_USD === ''
      ? '0.10'
      : env.TREG_MAX_COST_USD;
  const validCost =
    typeof cost === 'string' &&
    /^(?:0(?:\.[0-9]{1,6})?|1(?:\.0{1,6})?)$/.test(cost) &&
    Number(cost) > 0 &&
    Number(cost) <= 1;
  const configured =
    token.length > 0 &&
    token.length <= 4096 &&
    // eslint-disable-next-line no-control-regex -- Reject untrusted ASCII control characters.
    !/[\s\u0000-\u001f\u007f]/.test(token) &&
    (!org || label(org)) &&
    validCost;
  return Object.freeze({ configured, token, org, maxCostUsd: validCost ? cost : null });
}

export function validTregPeopleQuery(query) {
  return (
    plainObject(query) &&
    Object.keys(query).every(
      (key) => Object.hasOwn(queryStrings, key) || ['limit', 'keywords'].includes(key),
    ) &&
    Object.entries(queryStrings).every(
      ([key, max]) =>
        query[key] === undefined ||
        (typeof query[key] === 'string' &&
          query[key].trim().length > 0 &&
          query[key].length <= max &&
          // eslint-disable-next-line no-control-regex -- Reject untrusted ASCII control characters.
          !/[\u0000-\u001f\u007f]/.test(query[key])),
    ) &&
    ['q', 'company_domain', 'title', 'full_name'].some(
      (key) => typeof query[key] === 'string' && query[key].trim(),
    ) &&
    (query.limit === undefined ||
      (Number.isSafeInteger(query.limit) && query.limit >= 1 && query.limit <= 10)) &&
    (query.keywords === undefined ||
      (Array.isArray(query.keywords) &&
        query.keywords.length >= 1 &&
        query.keywords.length <= 10 &&
        query.keywords.every(
          (value) =>
            typeof value === 'string' &&
            value.trim() &&
            value.length <= 100 &&
            // eslint-disable-next-line no-control-regex -- Reject untrusted ASCII control characters.
            !/[\u0000-\u001f\u007f]/.test(value),
        )))
  );
}
