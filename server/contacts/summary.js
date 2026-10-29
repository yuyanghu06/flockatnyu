import { plainObject, validUuid } from '../automation/validation.js';
import { CONTACT_FIELDS } from './fields.js';

const keys = ['id', 'created_at', 'updated_at', 'fields'];
const fieldKeys = Object.keys(CONTACT_FIELDS);
const timestamp = (value) =>
  typeof value === 'string' && value.length <= 50 && Number.isFinite(Date.parse(value));

// A directory result is deliberately different from a full private contact.
// It cannot serve as the native-record snapshot required by an exact edit.
export const validContactSummary = (value) =>
  plainObject(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key)) &&
  validUuid(value.id) &&
  timestamp(value.created_at) &&
  timestamp(value.updated_at) &&
  plainObject(value.fields) &&
  Object.keys(value.fields).length === fieldKeys.length &&
  fieldKeys.every(
    (field) =>
      Object.hasOwn(value.fields, field) &&
      typeof value.fields[field] === 'string' &&
      value.fields[field].length <= CONTACT_FIELDS[field],
  );

export const projectContactSummary = (value) => ({
  id: value.id,
  created_at: value.created_at,
  updated_at: value.updated_at,
  fields: Object.fromEntries(fieldKeys.map((field) => [field, value.fields[field]])),
});
