// Discord message payloads for the marketing commands. Pure functions.
import { NO_MENTIONS } from '../discord/interactions.js';

// Field order and labels follow the ported marketing bot. The /event-details
// modals (details-form.js) write these keys; unknown saved keys are not shown.
export const DETAIL_FIELDS = Object.freeze([
  ['title', 'Event title'],
  ['when', 'Date & time'],
  ['location', 'Location'],
  ['description', 'Description'],
  ['food', 'Food'],
  ['assets', 'Assets (link)'],
  ['collab', 'Club collab'],
  ['tagging', 'Tag / collaborator'],
  ['notes', 'Notes'],
]);
export const REQUIRED_FIELDS = Object.freeze(['title', 'when', 'location', 'description']);
export const MAX_SELECT_OPTIONS = 25;
export const INFO_SELECT_ID = 'mkt:info';

const clip = (value, max) => {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export function eventSelect(customId, choices, placeholder = 'Pick an event…') {
  return [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: customId,
          placeholder,
          options: choices.slice(0, MAX_SELECT_OPTIONS).map((choice) => ({
            label: clip(choice.title, 100) || 'Untitled event',
            description: clip(choice.when, 100) || undefined,
            value: choice.token,
          })),
        },
      ],
    },
  ];
}

export function pickerMessage({ choices, total, partial, prompt, customId = INFO_SELECT_ID }) {
  const notes = [];
  if (total > choices.length)
    notes.push(`Showing the first ${choices.length} of ${total} upcoming events.`);
  if (partial) notes.push('The calendar could only be read partly, so some events may be missing.');
  return {
    content: [prompt, ...notes].join('\n'),
    components: eventSelect(customId, choices),
    allowed_mentions: NO_MENTIONS,
  };
}

export function detailsEmbed(event, details) {
  const fields = details?.fields ?? {};
  const shown = DETAIL_FIELDS.filter(
    ([key]) => key !== 'title' && typeof fields[key] === 'string' && fields[key].trim(),
  );
  const missing = REQUIRED_FIELDS.filter(
    (key) => !(typeof fields[key] === 'string' && fields[key].trim()),
  );
  return {
    title: clip(fields.title || event.title, 256),
    description: `Calendar date: ${event.date}`,
    color: 0x2ecc71,
    fields: shown.map(([key, label]) => ({ name: label, value: clip(fields[key], 1024) })),
    ...(missing.length ? { footer: { text: `Still missing: ${missing.join(', ')}` } } : {}),
    ...(details?.updatedAt ? { timestamp: details.updatedAt } : {}),
  };
}

export function infoMessage(event, details, components) {
  if (!details)
    return {
      content: `**${clip(event.title, 200)}** (${event.date}): no details submitted yet.`,
      embeds: [],
      components,
      allowed_mentions: NO_MENTIONS,
    };
  return {
    content: '',
    embeds: [detailsEmbed(event, details)],
    components,
    allowed_mentions: NO_MENTIONS,
  };
}

// Channel mentions render as the channel's name in Discord.
export function channelList(channelIds) {
  return channelIds.map((id) => `<#${id}>`).join(' or ');
}

export function denialMessage(reason, channelIds) {
  if (!channelIds.length) return "This command isn't enabled in any channel yet.";
  const where = channelList(channelIds);
  return reason === 'channel'
    ? `This command only works in ${where}, or in a thread inside one of them.`
    : `You don't have a role that can use this command. It works in ${where}.`;
}
