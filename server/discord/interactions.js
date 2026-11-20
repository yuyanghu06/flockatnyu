// Gateway interaction dispatcher for slash commands, components and modals.
// It is separate from Discord chat (MESSAGE_CREATE) and from the ingestion
// queue: interactions never enter agent_input_cache or move its checkpoint.
// Handlers are registered by exact command name and component/modal custom_id
// prefix; anything unregistered is ignored without a response.

const snowflake = (value) => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const tokenValid = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 500 &&
  /^[A-Za-z0-9._-]+$/.test(value);

export const InteractionType = Object.freeze({
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
});
export const InteractionCallback = Object.freeze({
  CHANNEL_MESSAGE: 4,
  DEFERRED_CHANNEL_MESSAGE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  MODAL: 9,
});
export const EPHEMERAL = 1 << 6;
export const NO_MENTIONS = Object.freeze({ parse: Object.freeze([]) });

// Interaction callbacks and webhook edits are authenticated by the interaction
// token, not the bot token. Mutations never retry: a lost response must not
// duplicate a reply.
export function createInteractionResponder({ rest }) {
  return Object.freeze({
    async callback(interaction, body, { signal } = {}) {
      return rest.post(`/interactions/${interaction.id}/${interaction.token}/callback`, {
        body,
        auth: false,
        signal,
      });
    },
    async editOriginal(interaction, body, { signal } = {}) {
      return rest.patch(
        `/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
        { body: { allowed_mentions: NO_MENTIONS, ...body }, auth: false, signal },
      );
    },
  });
}

function validInteraction(value, guildId) {
  return (
    value &&
    typeof value === 'object' &&
    snowflake(value.id) &&
    snowflake(value.application_id) &&
    tokenValid(value.token) &&
    Object.values(InteractionType).includes(value.type) &&
    value.guild_id === guildId &&
    snowflake(value.channel_id) &&
    value.data &&
    typeof value.data === 'object'
  );
}

function prefixOf(customId, prefixes) {
  if (typeof customId !== 'string' || customId.length > 100) return undefined;
  return prefixes.find((prefix) => customId === prefix || customId.startsWith(`${prefix}:`));
}

export function createInteractionDispatcher({
  guildId,
  commands = {},
  components = {},
  modals = {},
  responder,
  maxInFlight = 16,
  log = () => {},
}) {
  const componentPrefixes = Object.keys(components);
  const modalPrefixes = Object.keys(modals);
  let inFlight = 0;

  function route(interaction) {
    if (interaction.type === InteractionType.APPLICATION_COMMAND)
      return Object.hasOwn(commands, interaction.data.name)
        ? commands[interaction.data.name]
        : null;
    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
      const prefix = prefixOf(interaction.data.custom_id, componentPrefixes);
      return prefix ? components[prefix] : null;
    }
    const prefix = prefixOf(interaction.data.custom_id, modalPrefixes);
    return prefix ? modals[prefix] : null;
  }

  async function handle(event) {
    if (event?.t !== 'INTERACTION_CREATE') return { status: 'ignored' };
    const interaction = event.d;
    if (!validInteraction(interaction, guildId)) return { status: 'ignored' };
    const handler = route(interaction);
    if (!handler) return { status: 'ignored' };
    if (inFlight >= maxInFlight) {
      // Shed load with an immediate ephemeral reply rather than letting the
      // 3-second window lapse silently.
      await responder
        .callback(interaction, {
          type: InteractionCallback.CHANNEL_MESSAGE,
          data: {
            content: 'Busy right now. Try again in a moment.',
            flags: EPHEMERAL,
            allowed_mentions: NO_MENTIONS,
          },
        })
        .catch(() => {});
      return { status: 'busy' };
    }
    inFlight++;
    try {
      await handler({ interaction, responder });
      return { status: 'handled' };
    } catch {
      log({ status: 'interaction_dispatch_failed', stage: 'interaction_dispatch' });
      return { status: 'failed' };
    } finally {
      inFlight--;
    }
  }
  return Object.freeze({ handle, inFlight: () => inFlight });
}
