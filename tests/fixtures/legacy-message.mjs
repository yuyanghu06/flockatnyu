// Historical migration message fixture; contains no archive worker.
import {createHash} from 'node:crypto';
const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function snowflakeBefore(value) { return ((BigInt(new Date(value).getTime()) - 1420070400000n) << 22n).toString(); }
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
