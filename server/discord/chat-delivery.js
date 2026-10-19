/** Bounded text delivery with no retries or repost after a partial send. */
export function splitDiscordChatText(text, limit = 2000) {
  limit = Number.isInteger(limit) ? Math.max(2, Math.min(2000, limit)) : 2000;
  const chunks = [];
  let remaining = typeof text === 'string' ? text.slice(0, 8000) : '';
  if (/[\uD800-\uDBFF]/.test(remaining.at(-1) ?? '')) remaining = remaining.slice(0, -1);
  // Discord counts UTF-16 code units. Keep surrogate pairs together.
  while (remaining.length) {
    let end = Math.min(limit, remaining.length);
    if (end < remaining.length && /[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    chunks.push(remaining.slice(0, end)); remaining = remaining.slice(end);
  }
  return chunks;
}

export async function deliverDiscordChat({client, channelId, replyTo, interaction, text, signal} = {}) {
  const chunks = splitDiscordChatText(text);
  let sent = 0;
  for (const content of chunks) {
    if (signal?.aborted) return {status: sent ? 'partial' : 'aborted', sent};
    try {
      if (interaction) {
        const method = sent === 0 ? 'editInteraction' : 'sendInteractionFollowup';
        await client[method]({...interaction, content, signal});
      } else await client.sendMessage({channelId, replyTo, content, signal});
      sent++;
    } catch { return {status: sent ? 'partial' : 'failed', sent}; }
  }
  return {status: sent ? 'sent' : 'empty', sent};
}

export function startDiscordChatTyping({client, channelId, signal, intervalMs = 8000} = {}) {
  let stopped = false, pending = false;
  const pulse = async () => {
    if (stopped || pending || signal?.aborted) return;
    pending = true;
    try {await client.sendTyping({channelId, signal});} catch { /* Cosmetic only. */ }
    finally {pending = false;}
  };
  const stop = () => {stopped = true; clearInterval(timer); signal?.removeEventListener('abort', stop);};
  const timer = setInterval(() => {void pulse();}, Math.max(5000, intervalMs)); timer.unref?.();
  signal?.addEventListener('abort', stop, {once: true});
  void pulse();
  return stop;
}
