import {createHash} from 'node:crypto';
const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function snowflakeBefore(value) { return ((BigInt(new Date(value).getTime()) - 1420070400000n) << 22n).toString(); }
export function previousMidnight(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type,p.value]));
  const date = new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)-1));
  const day = date.toISOString().slice(0,10);
  // Determine NY offset at that local date's noon. DST changes are at 2 a.m.;
  // midnight uses the prior offset on transition days, so derive at UTC 05:00.
  const candidate = new Date(`${day}T05:00:00Z`);
  const hour = Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(candidate));
  return new Date(candidate.getTime() - hour * 3600000).toISOString();
}
export function normalizeMessage(raw,channel) {
  if (!raw || !snowflake(raw.id) || raw.channel_id !== channel.channelId || !snowflake(raw.author?.id) || !validTime(raw.timestamp) || (raw.edited_timestamp != null && !validTime(raw.edited_timestamp))) throw Object.assign(new Error('invalid_message'),{code:'invalid_message'});
  const payload = {};
  // Explicit allowlist excludes recursively embedded replies, forwarded snapshots,
  // resolved records and thread objects that may cross the selected source scope.
  for (const key of ['id','channel_id','author','content','timestamp','edited_timestamp','tts','mention_everyone','mentions','mention_roles','attachments','embeds','reactions','pinned','webhook_id','type','flags','message_reference','components','sticker_items','poll']) if (raw[key] !== undefined) payload[key] = raw[key];
  // Archive text and ordinary files, without image attachments or embedded
  // image metadata. No attachment URLs are fetched by this worker.
  const isImage = a => /^image\//i.test(a?.content_type || a?.mime_type || '') || [a?.filename,a?.url].some(value => /\.(?:png|jpe?g|gif|webp|avif|bmp|svg|heic|tiff?)(?:$|[?#])/i.test(value || '')) || a?.width != null && a?.height != null && !/^video\//i.test(a?.content_type || '');
  function textComponents(value,depth = 0) {
    if (depth > 12) return undefined;
    if (Array.isArray(value)) return value.map(item => textComponents(item,depth+1)).filter(item => item !== undefined);
    if (!value || typeof value !== 'object') return value;
    const type = Number(value.type);
    if ([11,12].includes(type) || type === 13 && isImage({...value,...value.file})) return undefined;
    const result = {};
    for (const [key,item] of Object.entries(value)) {
      if (['image','thumbnail','media','video','icon_url','proxy_icon_url','avatar','avatar_decoration_data','banner'].includes(key)) continue;
      const cleaned = textComponents(item,depth+1);
      if (cleaned !== undefined) result[key] = cleaned;
    }
    return result;
  }
  if (payload.components !== undefined) payload.components = textComponents(payload.components) ?? [];
  if (Array.isArray(payload.attachments)) payload.attachments = payload.attachments.filter(a => !isImage(a));
  if (Array.isArray(payload.embeds)) payload.embeds = payload.embeds.filter(e => e?.type !== 'image' && e?.type !== 'gifv').map(e => {
    const {image,thumbnail,video,...text} = e;
    for (const key of ['author','footer','provider']) if (text[key] && typeof text[key] === 'object') {
      const {icon_url,proxy_icon_url,...details} = text[key]; text[key] = details;
    }
    return text;
  });
  if (payload.author) { const {avatar,banner,avatar_decoration_data,...author} = payload.author; payload.author = author; }
  if (Array.isArray(payload.mentions)) payload.mentions = payload.mentions.map(({avatar,banner,avatar_decoration_data,...member}) => member);
  delete payload.sticker_items;
  payload.guild_id = channel.guildId;
  const content = typeof raw.content === 'string' ? raw.content : '';
  const embeddingText = [content,...(Array.isArray(payload.embeds)?payload.embeds:[]).flatMap(e => [e.title,e.description,e.url]),...(Array.isArray(payload.attachments)?payload.attachments:[]).map(a => a.filename)].filter(v => typeof v === 'string' && v).join('\n');
  if (content.length > 10000 || embeddingText.length > 50000 || JSON.stringify(payload).length > 200000) throw Object.assign(new Error('message_too_large'),{code:'message_too_large'});
  return {messageId:raw.id,channelId:channel.channelId,guildId:channel.guildId,authorId:raw.author.id,createdAt:new Date(raw.timestamp).toISOString(),editedAt:raw.edited_timestamp?new Date(raw.edited_timestamp).toISOString():null,
    replyToMessageId:snowflake(raw.message_reference?.message_id)?raw.message_reference.message_id:null,content,embeddingText,payload,contentHash:createHash('sha256').update(embeddingText).digest('hex'),url:`https://discord.com/channels/${channel.guildId}/${channel.channelId}/${raw.id}`};
}
export async function runDiscordSync({config,store,client,embedder,now = new Date(),signal} = {}) {
  const result = {status:'not_configured',channelsProcessed:0,pages:0,messages:0,scanned:0,embedded:0,errors:[],embeddingStatus:'disabled'};
  if (!config?.configured || !store?.configured || client?.configured === false) return result;
  const instant = typeof now === 'function' ? now() : now;
  const runAt = new Date(instant); if (!Number.isFinite(runAt.getTime())) return {...result,status:'invalid_request'};
  const timeout = AbortSignal.timeout(config.maxRuntimeMs), combined = signal ? AbortSignal.any([signal,timeout]) : timeout;
  const list = await store.listSyncChannels({signal:combined});
  if (list.status !== 'ready') return {...result,status:list.status};
  result.status = 'ready';
  for (const channel of list.channels) {
    if (!channel.enabled) continue;
    if (combined.aborted || result.scanned >= config.maxMessagesPerRun) { result.status = 'partial'; break; }
    try {
      if (channel.guildId !== config.guildId) throw Object.assign(new Error(),{code:'channel_scope_denied'});
      const configuredBackfill = channel.backfillFrom || config.backfillFrom;
      if (!validTime(configuredBackfill) || Date.parse(configuredBackfill) >= runAt.getTime()) throw Object.assign(new Error(),{code:'invalid_backfill'});
      await client.getChannel({channelId:channel.channelId,signal:combined});
      const loaded = await store.getSyncState({sourceId:channel.sourceId,signal:combined});
      if (loaded.status !== 'ready' && loaded.status !== 'empty') throw Object.assign(new Error(),{code:'database_unavailable'});
      const old = loaded.state || {};
      const backfill = new Date(configuredBackfill).toISOString();
      const unfinished = old.status === 'running' && validTime(old.windowFrom) && validTime(old.windowTo) && snowflake(old.before);
      const overlap = previousMidnight(runAt);
      const from = unfinished ? old.windowFrom : old.lastSuccessAt ? new Date(Math.max(Date.parse(backfill),Math.min(Date.parse(old.lastSuccessAt),Date.parse(overlap)))).toISOString() : backfill;
      const to = unfinished ? old.windowTo : runAt.toISOString();
      let before = unfinished ? old.before : snowflakeBefore(to), pageCount = 0, complete = false;
      let expectedBefore = old.before ?? null, expectedWindowTo = old.windowTo ?? null;
      while (!combined.aborted && pageCount < config.maxPagesPerChannel && result.scanned < config.maxMessagesPerRun) {
        const limit = Math.min(100,config.maxMessagesPerRun-result.scanned);
        const raw = await client.getMessages({channelId:channel.channelId,before,limit,signal:combined});
        if (!Array.isArray(raw) || raw.length > limit) throw Object.assign(new Error(),{code:'invalid_response'});
        const messages = raw.map(m => normalizeMessage(m,channel));
        // Validate pagination progress; never advance on reordered/non-progressing pages.
        if (messages.some(m => BigInt(m.messageId) >= BigInt(before))) throw Object.assign(new Error(),{code:'invalid_cursor'});
        messages.sort((a,b) => BigInt(a.messageId)<BigInt(b.messageId)?-1:1);
        complete = messages.length === 0 || messages.length < limit || messages.some(m => Date.parse(m.createdAt) < Date.parse(from));
        const eligible = messages.filter(m => Date.parse(m.createdAt) >= Date.parse(from) && Date.parse(m.createdAt) < Date.parse(to));
        const next = messages.length ? messages[0].messageId : before;
        const state = {sourceId:channel.sourceId,lastSuccessAt:complete?to:(old.lastSuccessAt??null),windowFrom:complete?null:from,windowTo:complete?null:to,before:complete?null:next,status:complete?'succeeded':'running',expectedBefore,expectedWindowTo,expectedLastSuccessAt:old.lastSuccessAt??null,expectedPolicyRevision:channel.policyRevision ?? null};
        const saved = await store.persistPage({channel,messages:eligible,state,signal:combined});
        if (saved.status !== 'ready') throw Object.assign(new Error(),{code:saved.status==='stale'?'concurrent_sync':'database_unavailable'});
        result.pages++; pageCount++; result.messages += eligible.length; result.scanned += raw.length;
        expectedBefore = state.before; expectedWindowTo = state.windowTo; before = next;
        if (complete) break;
      }
      result.channelsProcessed++;
      if (!complete) result.status = 'partial';
    } catch (error) {
      const codes = ['channel_scope_denied','permission_denied','invalid_token','not_found','rate_limited','discord_unavailable','invalid_message','message_too_large','invalid_response','invalid_cursor','invalid_backfill','database_unavailable','concurrent_sync','aborted'];
      result.errors.push({sourceId:channel.sourceId,code:codes.includes(error?.code)?error.code:combined.aborted?'aborted':'sync_failed'}); result.status = 'partial';
    }
  }
  // Model selection is deferred; collection never invokes an embedding provider.
  if (combined.aborted) result.status = 'partial';
  return result;
}
