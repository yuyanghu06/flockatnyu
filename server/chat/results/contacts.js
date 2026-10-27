import { contactFields } from '../../contacts/fields.js';

import { uuid } from '../../map/events.js';

import { contactToolNames, contactWriteOperations } from '../constants.js';

export function projectContact(value) {
  if (
    !uuid(value?.id) ||
    !['created_at', 'updated_at'].every(
      (key) =>
        typeof value[key] === 'string' &&
        value[key].length <= 50 &&
        Number.isFinite(Date.parse(value[key])),
    ) ||
    !value.raw_input ||
    typeof value.raw_input !== 'object' ||
    Array.isArray(value.raw_input)
  )
    return null;
  const raw_input = contactFields(value);
  if (Buffer.byteLength(JSON.stringify(raw_input)) > 24000) return null;
  return {
    id: value.id,
    created_at: value.created_at,
    updated_at: value.updated_at,
    raw_input: JSON.parse(JSON.stringify(raw_input)),
  };
}
export function projectContactWrite(name, result, args) {
  const receipt = result?.contactWrite,
    operation = contactWriteOperations[name];
  if (
    result?.status !== 'ready' ||
    !operation ||
    receipt?.operation !== operation ||
    !uuid(receipt.id) ||
    typeof receipt.updated_at !== 'string' ||
    receipt.updated_at.length > 50 ||
    !Number.isFinite(Date.parse(receipt.updated_at)) ||
    (name !== 'create_contact' && receipt.id.toLowerCase() !== args?.contactId?.toLowerCase())
  )
    return null;
  return { operation, id: receipt.id, updated_at: receipt.updated_at };
}
export function projectContactImport({ data, args, result }) {
  data.arguments = {};
  data.sources = [];
  const receipt = result?.contactImport;
  const itemValid = (item) =>
    uuid(item?.resultId) &&
    args?.resultIds?.some((id) => id.toLowerCase() === item.resultId.toLowerCase()) &&
    ['imported', 'existing'].includes(item.operation) &&
    uuid(item.id) &&
    typeof item.updated_at === 'string' &&
    item.updated_at.length <= 50 &&
    Number.isFinite(Date.parse(item.updated_at));
  if (
    receipt &&
    typeof receipt.complete === 'boolean' &&
    Array.isArray(receipt.items) &&
    receipt.items.length <= 10 &&
    receipt.items.every(itemValid) &&
    new Set(receipt.items.map((item) => item.resultId)).size === receipt.items.length &&
    receipt.imported === receipt.items.filter((item) => item.operation === 'imported').length &&
    receipt.existing === receipt.items.filter((item) => item.operation === 'existing').length
  ) {
    data.contactImport = {
      complete: receipt.complete,
      imported: receipt.imported,
      existing: receipt.existing,
      items: receipt.items.map(({ resultId, operation, id, updated_at }) => ({
        resultId,
        operation,
        id,
        updated_at,
      })),
    };
  }
  if (
    Array.isArray(result?.results) &&
    result.results.length === args?.resultIds?.length &&
    result.results.length <= 10
  ) {
    data.results = result.results.map((item, index) => {
      if (item?.resultId?.toLowerCase() !== args.resultIds[index].toLowerCase())
        return { status: 'invalid_response' };
      const confirmed = data.contactImport?.items.find((value) => value.resultId === item.resultId);
      const contact = confirmed ? projectContact(item.contact) : null;
      return {
        resultId: item.resultId,
        status: confirmed
          ? 'ready'
          : [
                'forbidden',
                'invalid_request',
                'not_configured',
                'aborted',
                'schema_not_ready',
                'conflict',
                'not_found',
                'rate_limited',
                'unavailable',
                'invalid_response',
                'response_too_large',
                'log_unavailable',
              ].includes(item.status)
            ? item.status
            : 'unavailable',
        ...(confirmed ? { operation: confirmed.operation, ...(contact ? { contact } : {}) } : {}),
        ...(item.reason === 'write_outcome_unknown' ? { reason: item.reason } : {}),
        ...(item.logging === 'log_unavailable' ? { logging: 'log_unavailable' } : {}),
      };
    });
    if (Buffer.byteLength(JSON.stringify(data.results)) > 60000)
      data.results = data.results.map(({ contact: _contact, ...item }) => item);
  }
  return data;
}
export function projectContactsResult({ data, name, args, result }) {
  if (contactToolNames.has(name)) {
    data.sources = [];
    if (['ready', 'empty'].includes(result?.status) && name !== 'delete_contact') {
      if (result.contact) {
        const contact = projectContact(result.contact);
        if (
          contact &&
          (name === 'create_contact' || contact.id.toLowerCase() === args?.contactId?.toLowerCase())
        )
          data.contact = contact;
        else data.possiblyTruncated = true;
      }
      if (Array.isArray(result.contacts) && result.contacts.length <= 10) {
        const contacts = result.contacts.map(projectContact);
        if (contacts.every(Boolean) && Buffer.byteLength(JSON.stringify(contacts)) <= 64000)
          data.contacts = contacts;
        else {
          data.possiblyTruncated = true;
          data.complete = false;
        }
      }
    }
    const receipt = projectContactWrite(name, result, args);
    if (receipt) data.contactWrite = receipt;
  }
}
