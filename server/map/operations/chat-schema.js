import { promptText } from '../../prompt-loader/index.js';
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
        description: promptText('tools/map/chat-fields#lookup-person'),
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
        promptText('tools/map/chat-fields#inherit-event-window'),
      ]
        .filter(Boolean)
        .join(' ');
      eventSchema.properties.id = {
        ...eventSchema.properties.id,
        description: promptText('tools/map/chat-fields#event-id'),
      };
      eventSchema.properties.url = {
        ...eventSchema.properties.url,
        description: promptText('tools/map/chat-fields#event-url'),
      };
      return {
        ...tool,
        description: promptText('tools/map/chat-fields#upsert-event'),
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
                    description: promptText('tools/map/chat-fields#participant-label'),
                  },
                  person_id: {
                    ...personSchema.properties.person_id,
                    description: promptText('tools/map/chat-fields#participant-id'),
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
