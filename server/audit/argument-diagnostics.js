import { DIAGNOSTIC_CODES, known } from './diagnostic-codes.js';

// Only traverse declared schema properties. Unknown property NAMES never leave here.
export function argumentDiagnostic(value, schema) {
  try {
    return inspectArguments(value, schema);
  } catch {
    return { keyword: 'type', field: 'unknown' };
  }
}
function inspectArguments(value, schema, depth = 0, field = 'unknown') {
  if (depth > 8) return { keyword: 'depth', field };
  if (!schema || typeof schema !== 'object') return { keyword: 'type', field };
  if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value)))
    return { keyword: 'enum', field };
  const type = schema.type;
  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return { keyword: 'type', field };
    for (const key of schema.required ?? [])
      if (!Object.hasOwn(value, key))
        return { keyword: 'required', field: known(DIAGNOSTIC_CODES.field, key) };
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties ?? {}, key)) {
        if (schema.additionalProperties !== true)
          return { keyword: 'additional_properties', field: 'additional_properties' };
        continue;
      }
      const failure = inspectArguments(
        value[key],
        schema.properties[key],
        depth + 1,
        known(DIAGNOSTIC_CODES.field, key),
      );
      if (failure) return failure;
    }
  } else if (type === 'array') {
    if (!Array.isArray(value)) return { keyword: 'type', field };
    if (value.length < (schema.minItems ?? 0)) return { keyword: 'min_items', field };
    if (value.length > (schema.maxItems ?? 1000)) return { keyword: 'max_items', field };
    for (const item of value) {
      const failure = inspectArguments(item, schema.items, depth + 1, field);
      if (failure) return failure;
    }
  } else if (type === 'string') {
    if (typeof value !== 'string') return { keyword: 'type', field };
    if (value.length < (schema.minLength ?? 0)) return { keyword: 'min_length', field };
    if (value.length > (schema.maxLength ?? 65536)) return { keyword: 'max_length', field };
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value))
      return { keyword: 'pattern', field };
  } else if (type === 'integer' || type === 'number') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (type === 'integer' && !Number.isSafeInteger(value))
    )
      return { keyword: 'type', field };
    if (value < (schema.minimum ?? -Infinity)) return { keyword: 'minimum', field };
    if (value > (schema.maximum ?? Infinity)) return { keyword: 'maximum', field };
  } else if (
    type === 'boolean' ? typeof value !== 'boolean' : type === 'null' ? value !== null : true
  )
    return { keyword: 'type', field };
  return null;
}
