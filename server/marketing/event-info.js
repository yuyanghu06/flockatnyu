// /event-info: an ephemeral dropdown of confirmed upcoming Calendar events;
// picking one shows the submitted marketing details or "no details submitted
// yet". Read-only: it registers short tokens for offered events and reads
// saved details, and never writes Calendar or details.
import { authorizeMarketingInteraction } from './config.js';
import { readUpcomingMarketingEvents } from './calendar-events.js';
import { EPHEMERAL, InteractionCallback, NO_MENTIONS } from '../discord/interactions.js';
import { MAX_SELECT_OPTIONS, denialMessage, infoMessage, pickerMessage } from './views.js';

const TOKEN = /^[0-9a-f]{16}$/;

function ephemeral(content) {
  return {
    type: InteractionCallback.CHANNEL_MESSAGE,
    data: { content, flags: EPHEMERAL, allowed_mentions: NO_MENTIONS },
  };
}

// Checks access before any acknowledgement, so a denied user gets an
// immediate ephemeral explanation and no Calendar or database work runs.
export async function denyUnlessAuthorized({ interaction, responder, config }) {
  const access = authorizeMarketingInteraction(interaction, config);
  if (access.allowed) return false;
  await responder.callback(
    interaction,
    ephemeral(denialMessage(access.reason, config.allowedChannelIds)),
  );
  return true;
}

// Reads Calendar, registers tokens for the first 25 events and returns the
// choices, or a user-facing message when there is nothing to offer.
export async function loadEventChoices({ calendar, store, now }) {
  const result = await readUpcomingMarketingEvents({ client: calendar, now });
  if (!['ready', 'partial'].includes(result.status))
    return { message: "I couldn't read the club calendar right now. Try again in a few minutes." };
  if (!result.events.length)
    return {
      message:
        result.status === 'partial'
          ? "I couldn't fully read the club calendar right now. Try again in a few minutes."
          : 'There are no confirmed upcoming events on the club calendar.',
    };
  const offered = result.events.slice(0, MAX_SELECT_OPTIONS);
  const registered = await store.register({
    events: offered.map((event) => ({
      eventId: event.eventId,
      title: event.title,
      date: event.date,
    })),
  });
  const tokens = new Map(
    registered.status === 'ready' && Array.isArray(registered.tokens)
      ? registered.tokens.map((row) => [row.eventId, row.token])
      : [],
  );
  if (offered.some((event) => !TOKEN.test(tokens.get(event.eventId) ?? '')))
    return { message: "I couldn't load the event list right now. Try again in a few minutes." };
  return {
    choices: offered.map((event) => ({
      token: tokens.get(event.eventId),
      title: event.title,
      when: event.when,
    })),
    total: result.events.length,
    partial: result.status === 'partial',
  };
}

export function createEventInfoHandlers({ config, calendar, store, now = () => new Date() }) {
  async function command({ interaction, responder }) {
    if (await denyUnlessAuthorized({ interaction, responder, config })) return;
    // Defer first: Calendar and database reads can exceed Discord's 3 seconds.
    await responder.callback(interaction, {
      type: InteractionCallback.DEFERRED_CHANNEL_MESSAGE,
      data: { flags: EPHEMERAL },
    });
    try {
      const loaded = await loadEventChoices({ calendar, store, now: now() });
      await responder.editOriginal(
        interaction,
        loaded.message
          ? { content: loaded.message }
          : pickerMessage({ ...loaded, prompt: 'Which event do you want the details for?' }),
      );
    } catch {
      await responder
        .editOriginal(interaction, { content: 'Something went wrong. Try /event-info again.' })
        .catch(() => {});
    }
  }

  async function select({ interaction, responder }) {
    if (await denyUnlessAuthorized({ interaction, responder, config })) return;
    // Acknowledge by updating the same ephemeral message in place.
    await responder.callback(interaction, { type: InteractionCallback.DEFERRED_UPDATE_MESSAGE });
    const components = Array.isArray(interaction.message?.components)
      ? interaction.message.components
      : [];
    try {
      const token = interaction.data?.values?.[0];
      const found = TOKEN.test(token ?? '')
        ? await store.lookup({ token })
        : { status: 'invalid_request' };
      if (found.status === 'not_found' || found.status === 'invalid_request') {
        await responder.editOriginal(interaction, {
          content: 'I lost track of that event. Run /event-info again.',
          embeds: [],
          components: [],
        });
        return;
      }
      if (found.status !== 'ready') {
        await responder.editOriginal(interaction, {
          content: "I couldn't load the details right now. Try again in a moment.",
          embeds: [],
          components,
        });
        return;
      }
      await responder.editOriginal(
        interaction,
        infoMessage(found.event, found.details, components),
      );
    } catch {
      await responder
        .editOriginal(interaction, {
          content: 'Something went wrong. Try /event-info again.',
          embeds: [],
        })
        .catch(() => {});
    }
  }

  return Object.freeze({ command, select });
}
