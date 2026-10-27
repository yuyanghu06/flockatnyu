import { createHash } from 'node:crypto';
import { canonicalJson } from '../../automation/validation.js';
import { text, uuid } from '../events.js';

import { chatMapLocalDisplay } from '../chat-time.js';

export const principalValid = (principal) =>
  text(principal?.id, 200, 1) &&
  Array.isArray(principal.allowedSourceIds) &&
  principal.allowedSourceIds.every(uuid);
export const normalizeChatMapPersonName = (value) =>
  value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
export const normalized = normalizeChatMapPersonName;
export const readPrincipalScope = (principal) =>
  JSON.stringify({
    id: principal.id,
    sources: principal.allowedSourceIds,
    google: principal.googleAccess === true,
    calendar: principal.calendarAccess === true,
    calendarId: principal.calendarId ?? null,
    targets: principal.calendarTargets ?? null,
    guild: principal.liveDiscord?.guildId ?? null,
    bindings: principal.mapSourceBindings ?? null,
  });
export const sha = (value) => createHash('sha256').update(value).digest('hex');
export const idFor = (value) => {
  const h = sha(value).slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
export const provenanceKeys = ['source_id', 'source_url', 'source_record_id', 'reported_at'];
export const personProvenanceKeys = ['source_id', 'source_url', 'reported_at'];
export const canonicalUuid = (value) => (uuid(value) ? value.toLowerCase() : value);
export const forbidden = () => ({
  status: 'forbidden',
  reason: 'request_local_map_write_required',
});
export const optionalProvenance = (schema, keys) => ({
  ...schema,
  required: schema.required.filter((key) => !keys.includes(key)),
  properties: {
    ...schema.properties,
    ...Object.fromEntries(
      keys
        .filter((key) => schema.properties[key])
        .map((key) => [
          key,
          {
            ...schema.properties[key],
            description:
              'Optional source metadata. Omit unchanged metadata on an existing event/participant so the adapter copies stored values; omit for a new direct-chat participant/report so the server supplies attribution. If included, copy exactly from the read result. Provider IDs/URLs are opaque: never decode, rebuild or re-encode them.',
          },
        ]),
    ),
  },
});
export function deduplicateParticipants(rows) {
  const people = [],
    seen = new Map();
  for (const [index, { participant, comparison }] of rows.entries()) {
    if (!uuid(participant.person_id)) {
      people.push(participant);
      continue;
    }
    const encoded = canonicalJson({ starts_at: null, ends_at: null, ...comparison }),
      previous = seen.get(participant.person_id);
    if (previous) {
      if (previous.encoded !== encoded)
        return {
          status: 'invalid',
          reason: 'duplicate_participant_ids',
          field: 'people',
          indices: [previous.index, index],
          diagnostics: { stage: 'local_validation', reason: 'duplicate_participant_ids' },
        };
      continue;
    }
    seen.set(participant.person_id, { encoded, index });
    people.push(participant);
  }
  return { people };
}
export function appliedSubmission(event, buildings, people, timeZone) {
  const submitted = {
    confirmedApplied: true,
    basis: 'submitted_values_not_readback',
    event: { ...structuredClone(event), local_display: chatMapLocalDisplay(event, null, timeZone) },
    buildings: [],
    people: [],
    complete: true,
  };
  const fits = () => Buffer.byteLength(JSON.stringify(submitted)) <= 31900;
  if (!fits()) return undefined;
  for (const [key, rows] of [
    ['buildings', buildings],
    ['people', people],
  ]) {
    for (const row of rows) {
      submitted[key].push({
        ...structuredClone(row),
        ...(key === 'people'
          ? { effective_local_display: chatMapLocalDisplay(event, row, timeZone) }
          : {}),
      });
      if (!fits()) {
        submitted[key].pop();
        submitted.complete = false;
        break;
      }
    }
  }
  return submitted;
}
