import { promptText } from '../../prompt-loader/index.js';
import {
  canonicalTimeZone,
  createTimeContext,
  resolveDateBoundary,
} from '../../shared/time-zone.js';
const snowflake = { type: 'string', pattern: '^[0-9]{1,20}$' };
const date = {
  type: 'string',
  description: promptText('tools/discord/fields#date-boundary'),
};
const timeZone = {
  type: 'string',
  maxLength: 100,
  description: promptText('tools/discord/fields#time-zone'),
};
const scope = {
  type: 'string',
  enum: ['eboard', 'general', 'team', 'all'],
  description: promptText('tools/discord/fields#scope'),
};
const schema = (properties, required = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});

export const LIVE_DISCORD_TOOLS = Object.freeze([
  {
    name: 'list_discord_channels',
    description: promptText('tools/discord/list_discord_channels#description'),
    parameters: schema({ query: { type: 'string', maxLength: 100 }, scope }),
  },
  {
    name: 'search_discord',
    description: promptText('tools/discord/search_discord#description'),
    parameters: schema({
      query: { type: 'string', maxLength: 500 },
      scope,
      channelIds: { type: 'array', minItems: 1, maxItems: 16, items: snowflake },
      authorId: snowflake,
      from: date,
      to: date,
      timeZone,
      mode: { type: 'string', enum: ['latest', 'relevance'] },
      limit: { type: 'integer', minimum: 1, maximum: 8 },
    }),
  },
  {
    name: 'read_discord_messages',
    description: promptText('tools/discord/read_discord_messages#description'),
    parameters: schema({
      channelId: snowflake,
      messageId: snowflake,
      url: {
        type: 'string',
        maxLength: 200,
        description: promptText('tools/discord/read_discord_messages#parameters.url.description'),
      },
      context: { type: 'boolean' },
      limit: { type: 'integer', minimum: 1, maximum: 8 },
    }),
  },
  {
    name: 'read_discord_window',
    description: promptText('tools/discord/read_discord_window#description'),
    parameters: schema({ channelId: snowflake, from: date, to: date, timeZone }, [
      'channelId',
      'from',
      'to',
    ]),
  },
]);

const id = (value) => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
export function validateLiveDiscordArguments(name, value, guildId, timeContext) {
  const tool = LIVE_DISCORD_TOOLS.find((candidate) => candidate.name === name);
  if (
    !tool ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !Object.hasOwn(tool.parameters.properties, key))
  )
    return null;
  const args = { ...value };
  const requestTime = createTimeContext(timeContext);
  if (!requestTime) return null;
  const effectiveTimeZone =
    args.timeZone === undefined ? requestTime.timeZone : canonicalTimeZone(args.timeZone);
  if (!effectiveTimeZone) return null;
  if (name === 'search_discord' || name === 'read_discord_window')
    args.timeZone = effectiveTimeZone;
  for (const required of tool.parameters.required || []) if (args[required] == null) return null;
  if (args.url !== undefined) {
    if (typeof args.url !== 'string' || args.url.length > 200) return null;
    let url;
    try {
      url = new URL(args.url);
    } catch {
      return null;
    }
    const match = /^\/channels\/([0-9]{1,20})\/([0-9]{1,20})\/([0-9]{1,20})$/.exec(url.pathname);
    if (
      url.origin !== 'https://discord.com' ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !match ||
      match[1] !== guildId ||
      (args.channelId && args.channelId !== match[2]) ||
      (args.messageId && args.messageId !== match[3])
    )
      return null;
    args.channelId = match[2];
    args.messageId = match[3];
    delete args.url;
  }
  for (const key of ['channelId', 'messageId', 'authorId'])
    if (args[key] !== undefined && !id(args[key])) return null;
  if (name === 'read_discord_messages' && !id(args.channelId)) return null;
  if (
    args.channelIds !== undefined &&
    (!Array.isArray(args.channelIds) ||
      !args.channelIds.length ||
      args.channelIds.length > 16 ||
      args.channelIds.some((value) => !id(value)))
  )
    return null;
  if (
    args.query !== undefined &&
    (typeof args.query !== 'string' ||
      args.query.length > (name === 'list_discord_channels' ? 100 : 500))
  )
    return null;
  if (args.mode !== undefined && !['latest', 'relevance'].includes(args.mode)) return null;
  if (args.scope !== undefined && !scope.enum.includes(args.scope)) return null;
  if (args.context !== undefined && typeof args.context !== 'boolean') return null;
  if (
    args.limit !== undefined &&
    (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 8)
  )
    return null;
  for (const key of ['from', 'to'])
    if (args[key] !== undefined) {
      const boundary = resolveDateBoundary(args[key], {
        timeZone: effectiveTimeZone,
        now: requestTime.now,
      });
      if (!boundary || Date.parse(boundary) < 1420070400000) return null;
      args[key] = boundary;
    }
  if (args.from && args.to && args.from >= args.to) return null;
  return args;
}

export function createDiscordReadOperations({ service, guildId } = {}) {
  const dispatch = {
    list_discord_channels: 'getCatalogue',
    search_discord: 'search',
    read_discord_messages: 'readMessages',
    read_discord_window: 'readWindow',
  };
  async function execute({
    name,
    arguments: args,
    principal,
    signal,
    timeContext,
    userMessage,
  } = {}) {
    const requestTime = createTimeContext(timeContext);
    if (!requestTime)
      return {
        status: 'invalid_request',
        sources: [],
        coverage: { complete: false, reason: 'invalid_request' },
      };
    const validated = validateLiveDiscordArguments(name, args, guildId, requestTime);
    if (!validated)
      return {
        status: 'invalid_request',
        sources: [],
        coverage: { complete: false, reason: 'invalid_request' },
      };
    if (!service || typeof service[dispatch[name]] !== 'function')
      return { status: 'not_configured', sources: [] };
    const routed =
      ['list_discord_channels', 'search_discord'].includes(name) && !validated.channelIds
        ? { scope: 'eboard', ...validated }
        : validated;
    const result = await service[dispatch[name]]({
      ...routed,
      principal,
      signal,
      timeContext: requestTime,
      ...(typeof userMessage === 'string' ? { userMessage } : {}),
    });
    if (name !== 'search_discord' && name !== 'read_discord_window') return result;
    return {
      ...result,
      coverage: {
        ...result?.coverage,
        timeZone: validated.timeZone,
        ...(validated.from ? { from: validated.from } : {}),
        ...(validated.to ? { to: validated.to } : {}),
      },
    };
  }
  return Object.freeze({ tools: LIVE_DISCORD_TOOLS, execute });
}
