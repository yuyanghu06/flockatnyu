import { chatMapTimeSchema } from '../chat-time.js';

import { chatMapTargetChoicePrompt } from '../../chat/behavior.js';

import { provenanceKeys, personProvenanceKeys, optionalProvenance } from './chat-helpers.js';

export function createChatMapSchema(mapTools) {
  const tools = (mapTools?.tools || []).map((tool) => {
    if (tool.name === 'read_map_events')
      return { ...tool, description: tool.description + ' ' + chatMapTargetChoicePrompt };
    if (tool.name === 'lookup_map_person')
      return {
        ...tool,
        description:
          'Resolve one existing trackable map person by a stated personName (unique exact full name or unique first name), or use empty arguments for the server-verified Discord speaker. Reuse successful IDs already returned in this request and existing unchanged participants from the current map snapshot after a failed write; do not look up the whole roster again. A changed person or genuinely unresolved identity may need a new lookup. Unknown or ambiguous identity returns no person; ask the user who they mean. Optional exact provider/providerUserId remains supported. No original source link or separate linked-author receipt is needed. Never create profiles or guess IDs.',
        parameters: {
          ...tool.parameters,
          required: [],
          properties: {
            ...tool.parameters.properties,
            personName: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      };
    if (tool.name === 'upsert_map_event') {
      const eventSchema = chatMapTimeSchema(
        optionalProvenance(tool.parameters.properties.event, provenanceKeys),
      );
      const personSchema = optionalProvenance(
        tool.parameters.properties.people.items,
        personProvenanceKeys,
      );
      personSchema.description = [
        personSchema.description,
        "For a NEW participant attending the entire event, omit starts_at, ends_at, starts_local and ends_local to inherit the event window. Never copy parent event timestamps into a new participant. Raw timestamps preserve only the SAME existing person's saved overrides. Use local fields for explicitly requested individual limits.",
      ]
        .filter(Boolean)
        .join(' ');
      eventSchema.properties.id = {
        ...eventSchema.properties.id,
        description:
          'Existing map event ID from the current authorized read, used only after USER-SUPPLIED facts identify a unique target. A returned ID or an ID you selected for a filtered read is not user selection. If multiple events still match, propose no calls for that ambiguous action; when no other work remains, end tool selection with zero calls so the answer stage asks which entry. Never choose the first ID. Omit id for a new event so the service assigns it.',
      };
      eventSchema.properties.url = {
        ...eventSchema.properties.url,
        description:
          'For EXISTING-event attendance or recovery OMIT url so the adapter retains the exact saved link. Include only for a genuine USER-requested link change or a new supported event link. Existing URLs and opaque IDs must never be decoded, reconstructed, re-encoded or repaired. Do not copy this optional field into attendance/recovery arguments.',
      };
      return {
        ...tool,
        description:
          'Before an existing-event write, identify a unique user target across ALL observed candidates. If several still fit, propose ZERO calls for that action, including further reads/lookups/writes. If no unrelated requested work remains, END tool selection with zero calls; the separate answer stage asks which entry. Result order or an ID you chose to read cannot select the target. Recovery applies only after this target is unambiguous. Argument shape is {event: event fields, buildings: building rows, people: participant rows, expectedUpdatedAt: the parent event updated_at}. expectedUpdatedAt is a TOP-LEVEL sibling of event, buildings and people, NEVER a field inside event. New or changed times use starts_local/ends_local, no offset, in event.time_zone; the server converts. Raw starts_at/ends_at are byte-exact SAME event/person preservation copies from a map read in this request only. Omit display-only local_display/effective_local_display. Write one complete event/building/participant snapshot to the map database. This tool performs no source fetch, identity lookup or Calendar operation. Existing-event updates use the exact parent event id and expectedUpdatedAt from an explicit map read in this request. Omitted unchanged source metadata and event.url are retained from that local read; direct-chat provenance is filled internally. Preserve all unrequested event and relationship facts. Only an applied result confirms saving; conflicts require a separate read.',
        parameters: {
          ...tool.parameters,
          properties: {
            ...tool.parameters.properties,
            event: eventSchema,
            people: {
              ...tool.parameters.properties.people,
              items: chatMapTimeSchema({
                ...personSchema,
                required: personSchema.required.filter((key) => key !== 'label'),
                properties: {
                  ...personSchema.properties,
                  label: {
                    ...personSchema.properties.label,
                    description:
                      "Optional plain-text activity caption. Omit to retain this same person's caption from the authorized same-event map read; a new participant defaults to empty. Explicit empty string clears the caption; never infer activity from location.",
                  },
                  person_id: {
                    ...personSchema.properties.person_id,
                    description:
                      'Existing trackable roster UUID returned by lookup_map_person; resolve a stated name or verified Discord actor, never invent a person ID.',
                  },
                },
              }),
            },
          },
        },
      };
    }
    return tool;
  });
  return tools;
}
