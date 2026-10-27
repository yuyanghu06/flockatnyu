import { promptText } from '../prompt-loader/index.js';
import { validateChatRequestContext } from './request-context.js';
const snowflake = (value) => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const exactKeys = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const label = (value, max) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  value.trim() === value &&
  // eslint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
  !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const reason = (value) =>
  value === null || (typeof value === 'string' && /^[A-Za-z0-9:_-]{1,100}$/.test(value));
const instant = (value) =>
  typeof value === 'string' &&
  value.length <= 30 &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
function discordRequest(value) {
  const context = validateChatRequestContext(value);
  if (!context || context.transport !== 'discord')
    throw new TypeError('Discord context requires a trusted Discord request');
  return context;
}
export const DISCORD_RECENT_CONTEXT_LIMITS = Object.freeze({
  messages: 2000,
  contentChars: 120000,
  messageChars: 4000,
});
export function validateDiscordRepliedMessage(value, { guildId, channelId, requestId } = {}) {
  if (
    ![guildId, channelId, requestId].every(snowflake) ||
    !exactKeys(value, ['status', 'reason', 'triggerMessageId', 'referencedMessageId', 'message']) ||
    !['none', 'ready', 'partial', 'unavailable'].includes(value.status) ||
    !reason(value.reason) ||
    value.triggerMessageId !== requestId ||
    (value.referencedMessageId !== null &&
      (!snowflake(value.referencedMessageId) ||
        BigInt(value.referencedMessageId) >= BigInt(requestId)))
  )
    throw new TypeError('Invalid Discord reply context');
  if (
    (value.status === 'none' &&
      (value.reason !== null || value.referencedMessageId !== null || value.message !== null)) ||
    (value.status === 'ready' && (value.reason !== null || !value.message)) ||
    (['partial', 'unavailable'].includes(value.status) && value.reason === null) ||
    (value.status === 'unavailable' && value.message !== null)
  )
    throw new TypeError('Invalid Discord reply status');
  let message = null;
  if (value.message !== null) {
    const row = value.message,
      triggerTime = Number((BigInt(requestId) >> 22n) + 1420070400000n);
    if (
      !exactKeys(row, [
        'id',
        'channelId',
        'authorId',
        'authorName',
        'createdAt',
        'editedAt',
        'content',
        'url',
        'hasNonTextContent',
        'textTruncated',
      ]) ||
      row.id !== value.referencedMessageId ||
      !snowflake(row.id) ||
      row.channelId !== channelId ||
      !snowflake(row.authorId) ||
      !label(row.authorName, 100) ||
      !instant(row.createdAt) ||
      Date.parse(row.createdAt) > triggerTime ||
      (row.editedAt !== null &&
        (!instant(row.editedAt) || Date.parse(row.editedAt) < Date.parse(row.createdAt))) ||
      typeof row.content !== 'string' ||
      row.content.length > 10000 ||
      row.url !== `https://discord.com/channels/${guildId}/${channelId}/${row.id}` ||
      typeof row.hasNonTextContent !== 'boolean' ||
      row.textTruncated !== false ||
      (value.status === 'ready' && row.hasNonTextContent) ||
      (value.status === 'partial' && !row.hasNonTextContent)
    )
      throw new TypeError('Invalid Discord replied message');
    message = Object.freeze({
      id: row.id,
      channelId: row.channelId,
      authorId: row.authorId,
      authorName: row.authorName,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      content: row.content,
      url: row.url,
      hasNonTextContent: row.hasNonTextContent,
      textTruncated: false,
    });
  } else if (value.status === 'partial' && value.referencedMessageId === null)
    throw new TypeError('Invalid partial Discord reply');
  return Object.freeze({
    status: value.status,
    reason: value.reason,
    triggerMessageId: value.triggerMessageId,
    referencedMessageId: value.referencedMessageId,
    message,
  });
}
const imageReasons = new Set([
  'image_coverage_limited',
  'aborted',
  'access_changed',
  'trigger_unverified',
]);
const imageItemReasons = new Set([
  'invalid_attachment_url',
  'unsupported_type',
  'attachment_size',
  'attachment_total',
  'attachment_type',
  'attachment_signature',
  'aborted',
  'download_unavailable',
]);
export function validateDiscordImageContext(
  value,
  { guildId, channelId, requestId, repliedMessage, messages } = {},
) {
  if (
    ![guildId, channelId, requestId].every(snowflake) ||
    !exactKeys(value, ['status', 'reason', 'candidateCount', 'loadedCount', 'images']) ||
    !['none', 'ready', 'partial', 'unavailable'].includes(value.status) ||
    (value.reason !== null && !imageReasons.has(value.reason)) ||
    !Array.isArray(value.images) ||
    value.images.length > 40 ||
    value.candidateCount !== value.images.length ||
    !Number.isInteger(value.loadedCount) ||
    value.loadedCount < 0 ||
    value.loadedCount > 4
  )
    throw new TypeError('Invalid Discord image context');
  const seen = new Set(),
    images = [];
  let ready = 0;
  const recent = Array.isArray(messages) ? new Set(messages.map((row) => row.id)) : null;
  for (const row of value.images) {
    if (
      !exactKeys(row, ['messageId', 'attachmentId', 'origin', 'name', 'url', 'status', 'reason']) ||
      !snowflake(row.messageId) ||
      !snowflake(row.attachmentId) ||
      seen.has(row.attachmentId) ||
      !label(row.name, 180) ||
      /[/\\]/.test(row.name) ||
      row.url !== `https://discord.com/channels/${guildId}/${channelId}/${row.messageId}` ||
      !['trigger', 'reply', 'recent'].includes(row.origin) ||
      !['ready', 'unavailable', 'unsupported', 'omitted'].includes(row.status) ||
      (row.origin === 'trigger' && row.messageId !== requestId) ||
      (row.origin !== 'trigger' && BigInt(row.messageId) >= BigInt(requestId)) ||
      (row.origin === 'reply' &&
        repliedMessage !== undefined &&
        row.messageId !== repliedMessage?.referencedMessageId) ||
      (row.origin === 'recent' && recent && !recent.has(row.messageId)) ||
      (row.status === 'ready' && row.reason !== null) ||
      (row.status !== 'ready' && !imageItemReasons.has(row.reason))
    )
      throw new TypeError('Invalid Discord image record');
    seen.add(row.attachmentId);
    if (row.status === 'ready') ready++;
    images.push(Object.freeze({ ...row }));
  }
  if (
    ready !== value.loadedCount ||
    (value.status === 'none' && (images.length !== 0 || value.reason !== null)) ||
    (value.status === 'ready' && (!ready || ready !== images.length || value.reason !== null)) ||
    (value.status === 'partial' && (!ready || value.reason === null)) ||
    (value.status === 'unavailable' && (ready !== 0 || value.reason === null))
  )
    throw new TypeError('Invalid Discord image status');
  return Object.freeze({ ...value, images: Object.freeze(images) });
}
export function validateDiscordRecentContext(value, requestContext) {
  if (value === undefined || value === null) return undefined;
  const request = discordRequest(requestContext);
  if (
    !exactKeys(value, [
      'guildId',
      'channelId',
      'from',
      'to',
      'complete',
      'reason',
      'messages',
      ...(Object.hasOwn(value, 'repliedMessage') ? ['repliedMessage'] : []),
      ...(Object.hasOwn(value, 'imageContext') ? ['imageContext'] : []),
    ]) ||
    value.guildId !== request.actor.guildId ||
    value.channelId !== request.channelId ||
    !instant(value.from) ||
    !instant(value.to) ||
    Date.parse(value.to) - Date.parse(value.from) !== 3600000 ||
    typeof value.complete !== 'boolean' ||
    !reason(value.reason) ||
    !Array.isArray(value.messages) ||
    value.messages.length > DISCORD_RECENT_CONTEXT_LIMITS.messages
  ) {
    throw new TypeError('Invalid recent Discord context');
  }
  const ids = new Set(),
    messages = [];
  let chars = 0,
    previous = Date.parse(value.from);
  for (const message of value.messages) {
    const timestamp = instant(message?.createdAt) ? Date.parse(message.createdAt) : NaN;
    if (
      !exactKeys(message, ['id', 'channelId', 'authorId', 'authorName', 'createdAt', 'content']) ||
      !snowflake(message.id) ||
      ids.has(message.id) ||
      message.channelId !== value.channelId ||
      !snowflake(message.authorId) ||
      !label(message.authorName, 100) ||
      !Number.isFinite(timestamp) ||
      timestamp < previous ||
      timestamp >= Date.parse(value.to) ||
      typeof message.content !== 'string' ||
      message.content.length > DISCORD_RECENT_CONTEXT_LIMITS.messageChars ||
      (chars += message.content.length) > DISCORD_RECENT_CONTEXT_LIMITS.contentChars
    ) {
      throw new TypeError('Invalid recent Discord message');
    }
    ids.add(message.id);
    previous = timestamp;
    messages.push(
      Object.freeze({
        id: message.id,
        channelId: message.channelId,
        authorId: message.authorId,
        authorName: message.authorName,
        createdAt: message.createdAt,
        content: message.content,
      }),
    );
  }
  const reply = Object.hasOwn(value, 'repliedMessage')
    ? validateDiscordRepliedMessage(value.repliedMessage, {
        guildId: value.guildId,
        channelId: value.channelId,
        requestId: request.requestId,
      })
    : undefined;
  const imageContext = Object.hasOwn(value, 'imageContext')
    ? validateDiscordImageContext(value.imageContext, {
        guildId: value.guildId,
        channelId: value.channelId,
        requestId: request.requestId,
        repliedMessage: reply,
        messages,
      })
    : undefined;
  return Object.freeze({
    guildId: value.guildId,
    channelId: value.channelId,
    from: value.from,
    to: value.to,
    complete: value.complete,
    reason: value.reason,
    messages: Object.freeze(messages),
    ...(reply ? { repliedMessage: reply } : {}),
    ...(imageContext ? { imageContext } : {}),
  });
}
export function validateDiscordUsers(value, requestContext) {
  if (value === undefined || value === null) return undefined;
  discordRequest(requestContext);
  if (
    !exactKeys(value, ['complete', 'reason', 'users']) ||
    typeof value.complete !== 'boolean' ||
    !reason(value.reason) ||
    !Array.isArray(value.users) ||
    value.users.length > 1000
  ) {
    throw new TypeError('Invalid Discord user mapping');
  }
  const ids = new Set(),
    users = [];
  for (const user of value.users) {
    if (
      !exactKeys(user, ['discordUserId', 'name']) ||
      !snowflake(user.discordUserId) ||
      ids.has(user.discordUserId) ||
      !label(user.name, 200)
    )
      throw new TypeError('Invalid Discord user mapping entry');
    ids.add(user.discordUserId);
    users.push(Object.freeze({ discordUserId: user.discordUserId, name: user.name }));
  }
  return Object.freeze({
    complete: value.complete,
    reason: value.reason,
    users: Object.freeze(users),
  });
}
export function discordRecentContextPrompt(value, requestContext) {
  const context = validateDiscordRecentContext(value, requestContext);
  if (!context) return '';
  const { repliedMessage, imageContext, ...recent } = context;
  const imagePrompt = imageContext
    ? promptText('agents/chat/discord-context#untrusted-live-discord-image-context-json') +
      JSON.stringify(imageContext) +
      promptText('agents/chat/discord-context#ready-images-in-this-metadata-order-are') +
      (imageContext.status === 'ready'
        ? promptText(
            'agents/chat/discord-context#coverage-describes-only-the-listed-attachment-candidates',
          )
        : promptText(
            'agents/chat/discord-context#image-coverage-is-limited-or-unavailable-disclose',
          )) +
      promptText(
        'agents/chat/discord-context#only-png-jpeg-web-p-attachments-are-supported-at-most',
      )
    : '';
  const replyPrompt = repliedMessage
    ? promptText('agents/chat/discord-context#untrusted-current-discord-reply-target-json') +
      JSON.stringify(repliedMessage) +
      '\n' +
      promptText('agents/chat/discord-context#this-is-the-exact-direct-message-to') +
      (repliedMessage.status === 'none'
        ? promptText('agents/chat/discord-context#the-verified-trigger-had-no-direct-reply')
        : repliedMessage.status === 'unavailable'
          ? promptText('agents/chat/discord-context#the-direct-reply-could-not-be-read')
          : repliedMessage.status === 'partial'
            ? promptText(
                'agents/chat/discord-context#reply-text-non-text-coverage-is-partial-use-the',
              )
            : promptText(
                'agents/chat/discord-context#the-supplied-replied-to-text-is-whole-within',
              ))
    : '';
  return (
    promptText('agents/chat/discord-context#untrusted-live-discord-messages-from-the-invoking') +
    JSON.stringify(recent) +
    promptText(
      'agents/chat/discord-context#these-are-live-original-message-text-records-supplied',
    ) +
    promptText('agents/chat/discord-context#message-contents-author-names-quoted-text-and') +
    promptText('agents/chat/discord-context#only-the-current-conversation-user-message-can') +
    promptText('agents/chat/discord-context#the-triggering-actor-remains-the-user-in') +
    promptText('agents/chat/discord-context#use-these-originals-as-conversational-evidence-when') +
    (imageContext
      ? promptText('agents/chat/discord-context#this-block-contains-message-text-only-any')
      : promptText(
          'agents/chat/discord-context#this-context-contains-message-text-only-attachments',
        )) +
    promptText('agents/chat/discord-context#direct-chat-map-writes-require-no-separate') +
    (context.complete
      ? promptText('agents/chat/discord-context#coverage-is-complete-for-message-text-in')
      : promptText(
          'agents/chat/discord-context#coverage-is-incomplete-explicitly-disclose-that-only',
        )) +
    replyPrompt +
    imagePrompt
  );
}
export function discordUsersPrompt(value, requestContext) {
  const context = validateDiscordUsers(value, requestContext);
  if (!context) return '';
  return (
    promptText('agents/chat/discord-context#server-supplied-discord-user-id-to-name-mapping') +
    JSON.stringify(context) +
    promptText('agents/chat/discord-context#use-this-mapping-only-to-interpret-discord') +
    promptText('agents/chat/discord-context#a-name-match-does-not-identify-a') +
    promptText('agents/chat/discord-context#the-current-speaker-is-still-the-exact') +
    (context.complete
      ? ''
      : promptText('agents/chat/discord-context#the-mapping-is-incomplete-missing-ids-do'))
  );
}
