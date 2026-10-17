export const validUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const validSourceId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_:@./=-]{0,199}$/.test(value);
export const validLabel = value => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/.test(value);
export const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  const result = JSON.stringify(value);
  if (result === undefined || typeof value === 'number' && !Number.isFinite(value)) throw new Error('invalid_json');
  return result;
}
const keywords = new Set(['type','description','properties','required','additionalProperties','enum','items','minItems','maxItems','minLength','maxLength','minimum','maximum','pattern']);
export function checkSchema(schema, depth = 0) {
  if (!plainObject(schema) || depth > 8 || Object.keys(schema).some(k => !keywords.has(k)) || !['object','array','string','number','integer','boolean','null'].includes(schema.type)) throw new Error('invalid_tool_schema');
  if (schema.description !== undefined && (typeof schema.description !== 'string' || schema.description.length > 4000)) throw new Error('invalid_tool_schema');
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length || schema.enum.length > 100)) throw new Error('invalid_tool_schema');
  for (const key of ['minItems','maxItems','minLength','maxLength']) if (schema[key] !== undefined && (!Number.isSafeInteger(schema[key]) || schema[key] < 0 || schema[key] > 65536)) throw new Error('invalid_tool_schema');
  for (const key of ['minimum','maximum']) if (schema[key] !== undefined && (typeof schema[key] !== 'number' || !Number.isFinite(schema[key]))) throw new Error('invalid_tool_schema');
  if (schema.pattern !== undefined) {
    // Restricted regex subset: no groups/alternation/backreferences and at most
    // one repeated atom, preventing combinatorial backtracking over source text.
    if (typeof schema.pattern !== 'string' || schema.pattern.length > 200 || /[()|\\]/.test(schema.pattern)
      || (schema.pattern.replace(/\[[^\]]*\]/g,'x').match(/[+*?{]/g)||[]).length>1
      || [...schema.pattern.matchAll(/\d+/g)].some(m=>Number(m[0])>65536)) throw new Error('invalid_tool_schema');
    try { new RegExp(schema.pattern, 'u'); } catch { throw new Error('invalid_tool_schema'); }
  }
  if (schema.type === 'object') {
    if (!plainObject(schema.properties || {}) || Object.keys(schema.properties || {}).length > 64 || typeof (schema.additionalProperties ?? false) !== 'boolean' || schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(k => typeof k !== 'string' || !Object.hasOwn(schema.properties || {}, k)))) throw new Error('invalid_tool_schema');
    for (const child of Object.values(schema.properties || {})) checkSchema(child, depth + 1);
  } else if (schema.properties !== undefined || schema.required !== undefined || schema.additionalProperties !== undefined) throw new Error('invalid_tool_schema');
  if (schema.type === 'array') checkSchema(schema.items, depth + 1);
  else if (schema.items !== undefined) throw new Error('invalid_tool_schema');
  return true;
}
export function validateArguments(value, schema, depth = 0) {
  if (depth > 8) return false;
  if (schema.enum && !schema.enum.some(v => canonicalJson(v) === canonicalJson(value))) return false;
  switch (schema.type) {
    case 'object': return plainObject(value) && (schema.required || []).every(k => Object.hasOwn(value, k)) && Object.entries(value).every(([k,v]) => Object.hasOwn(schema.properties || {}, k) ? validateArguments(v, schema.properties[k], depth + 1) : schema.additionalProperties === true);
    case 'array': return Array.isArray(value) && value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? 1000) && value.every(v => validateArguments(v, schema.items, depth + 1));
    case 'string': return typeof value === 'string' && value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? 65536) && (!schema.pattern || new RegExp(schema.pattern, 'u').test(value));
    case 'integer': case 'number': return typeof value === 'number' && Number.isFinite(value) && (schema.type !== 'integer' || Number.isSafeInteger(value)) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity);
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return false;
  }
}
