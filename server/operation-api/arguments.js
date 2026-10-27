import { plainObject } from '../automation/validation.js';

// Reject values JSON would silently erase or reinterpret before domain checks.
// In particular, an unknown undefined field must not disappear into a valid write,
// and non-finite timestamps must not become an allowed null boundary.
export function assertJsonArguments(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || seen.has(value)) throw new Error('invalid_json');
  if (!Array.isArray(value) && !plainObject(value)) throw new Error('invalid_json');
  seen.add(value);
  if (Object.getOwnPropertySymbols(value).length) throw new Error('invalid_json');
  const properties = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(properties).filter((key) => !(Array.isArray(value) && key === 'length'));
  if (
    Array.isArray(value) &&
    (keys.length !== value.length || keys.some((key, index) => key !== String(index)))
  )
    throw new Error('invalid_json');
  for (const key of keys) {
    const descriptor = properties[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
      throw new Error('invalid_json');
    assertJsonArguments(descriptor.value, seen);
  }
  seen.delete(value);
}
