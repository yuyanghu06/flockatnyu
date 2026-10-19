import {readDiscordChatConfig} from './chat-config.js';
import {deliverDiscordChat, startDiscordChatTyping} from './chat-delivery.js';

const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const label = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').trim().slice(0, 100).trim() : '';
const failureText = 'Flock could not complete that request. Please try again.';
const deniedText = 'Flock is not available for this request.';
const busyText = 'Flock is busy or your request limit has been reached. Please try again later.';
const inputText = 'Please include a question of no more than 8,000 characters.';
const abortError = () => Object.assign(new Error('aborted'), {code: 'aborted'});

/** Process-local transport. It stores only a bounded, expiring conversation per
 * actor/destination/source profile; it neither archives nor indexes Discord. */
export function createDiscordChatAdapter({config = {}, client, authorize, runChat, botUserId, now = Date.now, log = () => {}} = {}) {
  const settings = {...readDiscordChatConfig({}), ...config};
  const seen = new Map(), histories = new Map(), rates = new Map(), userActive = new Map(), active = new Set(), controllers = new Set(), activeIds = new Set();
  let stopped = false;
  const clock = () => {const value = now(); return value instanceof Date ? value.getTime() : Number(value);};
  const report = status => {try {log({status});} catch { /* Logging cannot affect delivery. */ }};
  function prune(time) {
    for (const [key, expires] of seen) if (expires <= time) seen.delete(key);
    for (const [key, entry] of histories) if (entry.expires <= time) histories.delete(key);
    for (const [key, entry] of rates) if (entry.expires <= time) rates.delete(key);
  }
  function remember(map, key, value, limit) {
    map.delete(key); map.set(key, value);
    while (map.size > limit) map.delete(map.keys().next().value);
  }
  function trimMessages(messages) {
    const result = messages.map(message => ({role: message.role, content: message.content}));
    const bytes = () => new TextEncoder().encode(JSON.stringify({messages: result})).length;
    while (result.length > 1 && (result.length > settings.maxHistoryMessages || result.reduce((n, message) => n + message.content.length, 0) > settings.maxHistoryChars || bytes() > 32000)) result.shift();
    // A retained turn must start with a user's own request.
    while (result.length > 1 && result[0].role !== 'user') result.shift();
    return result;
  }
  async function handle(event) {
    if (stopped || !settings.enabled || !settings.configured) return {status: 'disabled'};
    const data = event?.d, slash = event?.t === 'INTERACTION_CREATE';
    if (!data || !['MESSAGE_CREATE', 'INTERACTION_CREATE'].includes(event.t) || data.guild_id !== settings.guildId || !snowflake(data.channel_id) || !snowflake(data.id)) return {status: 'ignored'};
    if (slash && (data.type !== 2 || data.data?.name !== 'ask' || data.data?.type !== 1 || !snowflake(data.application_id) || typeof data.token !== 'string')) return {status: 'ignored'};
    const user = slash ? data.member?.user : data.author;
    const botId = typeof botUserId === 'function' ? botUserId() : botUserId;
    if (!snowflake(botId) || !snowflake(user?.id) || user.bot || user.system || user.id === botId || data.webhook_id || !slash && ![0, 19].includes(data.type ?? 0)) return {status: 'ignored'};
    const explicitMention = !slash && typeof data.content === 'string' && new RegExp(`<@!?${botId}>`).test(data.content);
    const reference = !slash ? data.message_reference : null;
    if (!slash && !explicitMention && !snowflake(reference?.message_id)) return {status: 'ignored'};
    const time = clock(); prune(time);
    const dedupKey = `${slash ? 'interaction' : 'message'}:${data.id}`;
    if (activeIds.has(dedupKey) || seen.has(dedupKey)) return {status: 'duplicate'};
    const actorKey = `${data.guild_id}:${user.id}`;
    // Reserve all transport work synchronously, including acknowledgement.
    // Saturated slash requests receive no network response and may time out in
    // Discord; spawning an unbounded set of rejection ACKs defeats this cap.
    if (active.size >= settings.maxConcurrent || (userActive.get(actorKey) ?? 0) >= settings.perUserConcurrent) return {status: 'busy'};
    remember(seen, dedupKey, time + settings.dedupTtlMs, settings.maxDedupEntries);
    const controller = new AbortController(), signal = controller.signal;
    active.add(controller); activeIds.add(dedupKey);
    userActive.set(actorKey, (userActive.get(actorKey) ?? 0) + 1);
    controllers.add(controller);
    const parentAbort = () => controller.abort();
    event.signal?.addEventListener('abort', parentAbort, {once: true});
    if (event.signal?.aborted) controller.abort();
    const timeout = setTimeout(() => controller.abort(), settings.requestTimeoutMs); timeout.unref?.();
    let rejectAbort;
    const aborted = new Promise((_, reject) => {rejectAbort = () => reject(abortError()); signal.addEventListener('abort', rejectAbort, {once: true});});
    void aborted.catch(() => {});
    // An already-aborted event never starts network/model work.
    if (signal.aborted) rejectAbort();
    const wait = promise => Promise.race([promise, aborted]);
    let acknowledged = false, authorized = false, stopTyping = () => {};
    const interaction = slash ? {applicationId: data.application_id, token: data.token} : null;
    const deliver = text => wait(deliverDiscordChat({client, channelId: data.channel_id, replyTo: slash ? null : data.id, interaction, text, signal}));
    async function rejectRequest(text, status) {
      if (slash && acknowledged || authorized) await deliver(text);
      return {status};
    }
    try {
      if (signal.aborted) throw abortError();
      // Discord requires acknowledgement within three seconds. Defer before
      // source/member lookups, with a separate response on denial or failure.
      if (slash) {await wait(client.ackInteraction({interactionId: data.id, token: data.token, signal})); acknowledged = true;}
      if (stopped || signal.aborted) throw abortError();
      const access = await wait(authorize({guildId: data.guild_id, channelId: data.channel_id, userId: user.id, signal}));
      if (!access?.principal?.id || typeof access.sourceProfileId !== 'string' || !/^[A-Za-z0-9:_-]{1,100}$/.test(access.sourceProfileId) || !(access.threadId === null || access.threadId === data.channel_id)) return await rejectRequest(deniedText, 'denied');
      authorized = true;
      if (!slash && !explicitMention) {
        if (reference.guild_id != null && reference.guild_id !== settings.guildId || reference.channel_id != null && reference.channel_id !== data.channel_id) return {status: 'ignored'};
        let original = data.referenced_message;
        if (!original) original = await wait(client.getMessage({channelId: data.channel_id, messageId: reference.message_id, signal}));
        if (original?.id !== reference.message_id || original?.channel_id !== data.channel_id || original.guild_id != null && original.guild_id !== settings.guildId || original.author?.id !== botId || original.author?.bot !== true || original.webhook_id) return {status: 'ignored'};
      }
      let question;
      if (slash) {
        const options = data.data.options;
        question = Array.isArray(options) && options.length === 1 && options[0]?.name === 'question' && options[0]?.type === 3 ? options[0].value : null;
      } else question = typeof data.content === 'string' ? data.content.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim() : null;
      if (typeof question !== 'string' || !question.trim() || question.length > 8000) return await rejectRequest(inputText, 'invalid_question');
      question = question.trim();
      const rate = rates.get(actorKey) ?? {count: 0, expires: clock() + 3600000};
      if (rate.count >= settings.requestsPerUserHour) return await rejectRequest(busyText, 'rate_limited');
      rate.count++;
      // Limit attacker-controlled distinct user keys as well as history keys.
      if (!rates.has(actorKey) && rates.size >= settings.maxDedupEntries) return await rejectRequest(busyText, 'rate_limited');
      rates.set(actorKey, rate);
      const historyKey = JSON.stringify([data.guild_id, data.channel_id, access.threadId, user.id, access.sourceProfileId]);
      const previous = histories.get(historyKey)?.messages ?? [];
      const messages = trimMessages([...previous, {role: 'user', content: question}]);
      const username = label(user.username) || `discord-user-${user.id}`;
      const requestContext = {transport: 'discord',
        actor: {provider: 'discord', userId: user.id, guildId: data.guild_id, username, displayName: label(data.member?.nick || user.global_name || user.username) || username},
        channelId: data.channel_id, threadId: access.threadId, requestId: data.id, sourceProfileId: access.sourceProfileId};
      let text = '', done = false, failed = false;
      const onRecord = record => {
        if (signal.aborted || done || failed) return;
        if (record?.type === 'delta' && typeof record.text === 'string') text += record.text.slice(0, Math.max(0, 8000 - text.length));
        else if (record?.type === 'done') done = true;
        else if (record?.type === 'error') failed = true;
      };
      if (!slash) stopTyping = startDiscordChatTyping({client, channelId: data.channel_id, signal, intervalMs: settings.typingIntervalMs});
      const result = await wait(runChat({conversation: {messages, timeZone: settings.timezone}, principal: access.principal, requestContext, signal, onRecord}));
      if (result?.[Symbol.asyncIterator]) {
        const iterator = result[Symbol.asyncIterator]();
        try {while (true) {const step = await wait(iterator.next()); if (step.done) break; onRecord(step.value);}}
        finally {if (signal.aborted) void iterator.return?.().catch?.(() => {});}
      }
      if (!done || failed || !text.trim()) return await rejectRequest(failureText, 'failed');
      const delivery = await deliver(text);
      if (delivery.status === 'sent') remember(histories, historyKey, {messages: trimMessages([...messages, {role: 'assistant', content: text}]), expires: clock() + settings.historyTtlMs}, settings.maxHistories);
      report(delivery.status === 'sent' ? 'chat_sent' : 'chat_delivery_failed');
      return {status: delivery.status, sent: delivery.sent};
    } catch {
      report(signal.aborted ? 'chat_aborted' : 'chat_failed');
      // A failed partial delivery is never retried by this adapter. Errors here
      // precede answer delivery, so a generic response is safe when authorized.
      if (!signal.aborted && (authorized || acknowledged)) {try {await deliver(failureText);} catch {}}
      else if (signal.aborted && !stopped && !event.signal?.aborted && (authorized || acknowledged)) {
        // The generation timeout must also clear a deferred slash response.
        // This cleanup gets its own short deadline and contains no model text.
        await deliverDiscordChat({client, channelId: data.channel_id, replyTo: slash ? null : data.id, interaction,
          text: 'Flock took too long to answer. Please try again.', signal: AbortSignal.timeout(5000)});
      }
      return {status: signal.aborted ? 'aborted' : 'failed'};
    } finally {
      stopTyping(); clearTimeout(timeout); controller.abort();
      controllers.delete(controller);
      signal.removeEventListener('abort', rejectAbort); event.signal?.removeEventListener('abort', parentAbort);
      active.delete(controller); activeIds.delete(dedupKey);
      const count = (userActive.get(actorKey) ?? 1) - 1; if (count) userActive.set(actorKey, count); else userActive.delete(actorKey);
    }
  }
  return Object.freeze({handle, stop() {stopped = true; for (const controller of controllers) controller.abort(); seen.clear(); histories.clear(); rates.clear();}});
}
