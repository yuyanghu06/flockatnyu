import { plainObject } from '../../automation/validation.js';
import { CONTACT_FIELDS } from '../../contacts/store.js';
import { exaContactFields } from '../../contacts/fields.js';

const label = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);
export function projectTregUsage(value) {
  if (
    !plainObject(value) ||
    !label(value.provider) ||
    !(value.callId === null || label(value.callId)) ||
    !(value.costMicro === null || (Number.isSafeInteger(value.costMicro) && value.costMicro >= 0))
  )
    return null;
  return { provider: value.provider, callId: value.callId, costMicro: value.costMicro };
}
export function projectTregFields(value) {
  if (!plainObject(value)) return {};
  const exa = exaContactFields(value);
  return Object.fromEntries(
    Object.entries(CONTACT_FIELDS)
      .map(([key, maxLength]) => {
        const field = Object.hasOwn(value, key) ? value[key] : exa[key];
        return typeof field === 'string' && field.length <= maxLength ? [key, field] : null;
      })
      .filter(Boolean),
  );
}
