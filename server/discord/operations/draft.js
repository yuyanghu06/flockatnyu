import { promptText } from '../../prompt-loader/index.js';
import { validateChatRequestContext } from '../../chat/request-context.js';

const snowflake = (value) => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const uuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const readable = new Set([0, 5, 10, 11, 12]);
const failure = (status, reason = status) => ({ status, reason, sources: [], sent: false });
export const DISCORD_DRAFT_TOOLS = Object.freeze([
  Object.freeze({
    name: 'draft_discord_message',
    readOnly: true,
    description: promptText('tools/discord/draft_discord_message#description'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['targetChannel', 'content'],
      properties: {
        targetChannel: { type: 'string', minLength: 1, maxLength: 100 },
        content: { type: 'string', minLength: 1, maxLength: 2000 },
      },
    },
  }),
]);

function trustedContext({ requestContext, principal, userMessage }, guildId) {
  let context;
  try {
    context = validateChatRequestContext(requestContext);
  } catch {
    return undefined;
  }
  if (
    !context ||
    context.actor.guildId !== guildId ||
    principal?.id !== `discord:${guildId}:${context.actor.userId}` ||
    !Array.isArray(principal.allowedSourceIds) ||
    !principal.allowedSourceIds.length ||
    principal.allowedSourceIds.length > 500 ||
    !principal.allowedSourceIds.every(uuid) ||
    principal.liveDiscord?.mode !== 'local-operator' ||
    !Array.isArray(principal.liveDiscord?.allowedSourceIds) ||
    !principal.liveDiscord.allowedSourceIds.length ||
    principal.liveDiscord.allowedSourceIds.length > 500 ||
    !principal.liveDiscord.allowedSourceIds.every(
      (id) => uuid(id) && principal.allowedSourceIds.includes(id),
    ) ||
    principal.liveDiscord?.transport !== 'discord-chat' ||
    principal.liveDiscord.guildId !== guildId ||
    principal.liveDiscord.invokingChannelId !== context.channelId ||
    typeof userMessage !== 'string' ||
    !userMessage.trim()
  )
    return undefined;
  return context;
}

// The adapter receives metadata GETs and an authorization function only. It has
// no message reader, delivery client, database write or native-draft capability.
export function createDiscordDraftOperations({ guildId, store, metadataClient, access } = {}) {
  function createRequest(context = {}) {
    const trusted = trustedContext(context, guildId);
    async function execute({ name, arguments: args, principal, signal } = {}) {
      if (!trusted || principal !== context.principal) return failure('forbidden');
      if (
        name !== 'draft_discord_message' ||
        !args ||
        typeof args !== 'object' ||
        Array.isArray(args) ||
        Object.keys(args).length !== 2 ||
        !Object.hasOwn(args, 'targetChannel') ||
        !Object.hasOwn(args, 'content') ||
        typeof args.targetChannel !== 'string' ||
        !args.targetChannel.trim() ||
        args.targetChannel.length > 100 ||
        typeof args.content !== 'string' ||
        !args.content.trim() ||
        args.content.length > 2000
      )
        return failure('invalid_request');
      if (signal?.aborted) return failure('aborted');
      if (
        !snowflake(guildId) ||
        typeof store?.listSyncChannels !== 'function' ||
        typeof metadataClient?.getGuildChannels !== 'function' ||
        typeof metadataClient?.getActiveThreads !== 'function' ||
        typeof access?.authorize !== 'function'
      )
        return failure('not_configured');
      try {
        const [catalogue, channels, active] = await Promise.all([
          store.listSyncChannels({ signal }),
          metadataClient.getGuildChannels({ signal }),
          metadataClient.getActiveThreads({ signal }),
        ]);
        if (signal?.aborted) return failure('aborted');
        if (
          catalogue?.status !== 'ready' ||
          !Array.isArray(catalogue.channels) ||
          catalogue.channels.length > 10000 ||
          !Array.isArray(channels) ||
          channels.length > 500 ||
          !Array.isArray(active?.threads) ||
          active.threads.length > 10000
        )
          return failure('unavailable');
        const published = new Set(
          catalogue.channels
            .filter(
              (row) => row?.guildId === guildId && row.enabled === true && snowflake(row.channelId),
            )
            .map((row) => row.channelId),
        );
        const metadata = new Map();
        for (const row of [...channels, ...active.threads]) {
          if (
            !snowflake(row?.id) ||
            row.guild_id !== guildId ||
            metadata.has(row.id) ||
            !Number.isInteger(row.type) ||
            typeof row.name !== 'string' ||
            row.name.length > 300
          )
            return failure('unavailable');
          metadata.set(row.id, row);
        }
        const query = args.targetChannel.trim();
        const exactId =
          /^<#([0-9]{1,20})>$/.exec(query)?.[1] || (snowflake(query) ? query : undefined);
        const matches = [...metadata.values()].filter(
          (row) =>
            readable.has(row.type) &&
            published.has(row.id) &&
            (exactId ? row.id === exactId : row.name.toLowerCase() === query.toLowerCase()),
        );
        // Never authorize an unbounded series or expose unverified candidates.
        if (matches.length > 10) return failure('unavailable', 'coverage_incomplete');
        const authorized = [];
        for (const row of matches) {
          if (signal?.aborted) return failure('aborted');
          try {
            await access.authorize({
              guildId,
              channelId: row.id,
              userId: trusted.actor.userId,
              signal,
            });
            if (signal?.aborted) return failure('aborted');
            authorized.push({
              guildId,
              channelId: row.id,
              name: row.name.slice(0, 100),
              url: `https://discord.com/channels/${guildId}/${row.id}`,
            });
          } catch (error) {
            if (signal?.aborted) return failure('aborted');
            // A failed fresh authorization never exposes target metadata.
            if (error?.code !== 'discord_chat_denied') return failure('unavailable');
          }
        }
        if (!authorized.length) return failure('forbidden');
        if (authorized.length > 1)
          return {
            ...failure('ambiguous', 'ambiguous_target'),
            discordDraftCandidates: authorized,
          };
        // Recheck immediately before returning a draft; the returned principal
        // is deliberately discarded and never broadens this request's grants.
        await access.authorize({
          guildId,
          channelId: authorized[0].channelId,
          userId: trusted.actor.userId,
          signal,
        });
        if (signal?.aborted) return failure('aborted');
        return {
          status: 'ready',
          sources: [],
          sent: false,
          discordDraft: { sent: false, target: authorized[0], content: args.content },
        };
      } catch (error) {
        return failure(
          signal?.aborted
            ? 'aborted'
            : error?.code === 'discord_chat_denied'
              ? 'forbidden'
              : 'unavailable',
        );
      }
    }
    return Object.freeze({ tools: trusted ? DISCORD_DRAFT_TOOLS : [], execute });
  }
  return Object.freeze({ tools: [], createRequest, execute: async () => failure('forbidden') });
}
