import { promptText } from '../prompt-loader/index.js';
// Only trusted server transports may supply this object. Browser request bodies
// never become request context, and Discord labels remain untrusted display data.
const snowflake = (value) => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const exactKeys = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const label = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 100 &&
  value.trim() === value &&
  // eslint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
  !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
export function validateChatRequestContext(value) {
  if (value === undefined || value === null) return undefined;
  if (
    !exactKeys(value, [
      'transport',
      'actor',
      'channelId',
      'threadId',
      'requestId',
      'sourceProfileId',
    ]) ||
    value.transport !== 'discord' ||
    !exactKeys(value.actor, ['provider', 'userId', 'guildId', 'username', 'displayName']) ||
    value.actor.provider !== 'discord' ||
    ![value.actor.userId, value.actor.guildId, value.channelId, value.requestId].every(snowflake) ||
    (value.threadId !== null && !snowflake(value.threadId)) ||
    !label(value.actor.username) ||
    !label(value.actor.displayName) ||
    typeof value.sourceProfileId !== 'string' ||
    !/^[A-Za-z0-9:_-]{1,100}$/.test(value.sourceProfileId)
  ) {
    throw new TypeError('Invalid trusted chat request context');
  }
  return Object.freeze({
    transport: 'discord',
    actor: Object.freeze({
      provider: 'discord',
      userId: value.actor.userId,
      guildId: value.actor.guildId,
      username: value.actor.username,
      displayName: value.actor.displayName,
    }),
    channelId: value.channelId,
    threadId: value.threadId,
    requestId: value.requestId,
    sourceProfileId: value.sourceProfileId,
  });
}
export function chatRequestContextPrompt(value) {
  const context = validateChatRequestContext(value);
  if (!context) return '';
  return (
    promptText('agents/chat/request-context#server-verified-discord-request-context-json') +
    JSON.stringify(context) +
    promptText('agents/chat/request-context#the-actor-identifies-the-discord-user-who') +
    promptText('agents/chat/request-context#use-this-context-to-understand-who-is') +
    promptText('agents/chat/request-context#do-not-infer-a-map-person-from') +
    promptText('agents/chat/request-context#respond-in-the-current-discord-conversation-do')
  );
}
