import {createHash} from 'node:crypto';
import {discordChannelScope, LEADERSHIP_CHANNEL_ID} from './channel-scope.js';
import {isDiscordChannelExcluded} from './discovery.js';

const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const threadTypes = new Set([10,11,12]);
const readable = new Set([0,5,10,11,12]);
const denied = () => Object.assign(new Error('discord_chat_denied'), {code:'discord_chat_denied'});
function viewAccessKey(channel) {
  if(!Array.isArray(channel?.permission_overwrites))return null;
  try {
    return JSON.stringify(channel.permission_overwrites.map(overwrite=>{
      if(!snowflake(overwrite.id)||![0,1].includes(overwrite.type))throw denied();
      const relevant=1024n|65536n;
      return [overwrite.id,overwrite.type,(BigInt(overwrite.allow)&relevant).toString(),(BigInt(overwrite.deny)&relevant).toString()];
    }).filter(row=>row[2]!=='0'||row[3]!=='0').sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  } catch {return null;}
}

/** Destination and source profile come from current service policy and Discord
 * metadata. The incoming member/message never supplies an access grant. */
export function createDiscordChatAccess({config, store, client, memberClient,now=Date.now} = {}) {
  async function authorize({guildId,channelId,userId,signal} = {}) {
    if (!config?.enabled || guildId !== config.guildId || !snowflake(guildId) || !snowflake(channelId) || !snowflake(userId)) throw denied();
    const allowed = new Set((config.allowedSourceIds || []).filter(uuid));
    if (!allowed.size) throw denied();
    const [policyResult,catalogueResult,metadata,detail,member,active,rawChannels,roles,guild] = await Promise.all([
      store.getPolicy({guildId,signal}),store.listSyncChannels({signal}),client.getGuildChannels({signal}),
      client.getChannel({channelId,signal}),memberClient.getGuildMember({guildId,userId,signal}),
      client.getActiveThreads ? client.getActiveThreads({signal}) : Promise.resolve({threads:[]}),
      memberClient.getGuildChannelsMetadata ? memberClient.getGuildChannelsMetadata({guildId,signal}) : Promise.resolve(null),
      memberClient.getGuildRoles({guildId,signal}),memberClient.getGuildMetadata({guildId,signal}),
    ]);
    const policy = policyResult?.policy;
    if (policyResult?.status !== 'ready' || !policy || policy.guildId !== guildId || policy.paused
      || !Number.isSafeInteger(policy.revision) || policy.revision < 1
      || !Array.isArray(policy.excludedCategoryIds) || !Array.isArray(policy.excludedChannelIds)
      || [...policy.excludedCategoryIds,...policy.excludedChannelIds].some(value=>!snowflake(value))
      || catalogueResult?.status !== 'ready' || !Array.isArray(catalogueResult.channels)
      || catalogueResult.channels.length > 10000 || !Array.isArray(metadata) || metadata.length > 500
      || !Array.isArray(active?.threads) || active.threads.length > 10000) throw denied();
    if (member?.user?.id !== userId || member.user.bot || member.pending === true || !Array.isArray(member.roles)
      || member.roles.some(role=>!snowflake(role)) || guild?.id!==guildId || !snowflake(guild.owner_id)
      || !Array.isArray(roles)||roles.length>1000 || roles.some(role=>!snowflake(role?.id)||typeof role.permissions!=='string'||!/^\d+$/.test(role.permissions))) throw denied();
    if(member.communication_disabled_until && (!Number.isFinite(Date.parse(member.communication_disabled_until))
      || Date.parse(member.communication_disabled_until)>Number(now())))throw denied();
    if (detail?.id !== channelId || detail.guild_id !== guildId || !readable.has(detail.type)) throw denied();
    let permissions;
    try { permissions = BigInt(detail.botPermissions); } catch { throw denied(); }
    const sendPermission = threadTypes.has(detail.type) ? 1n << 38n : 1n << 11n;
    if (!(permissions & 8n) && (!(permissions & 1024n) || !(permissions & sendPermission))) throw denied();
    if (threadTypes.has(detail.type) && (detail.thread_metadata?.archived || detail.thread_metadata?.locked)) throw denied();
    const channels = new Map();
    for (const row of [...metadata,...active.threads]) {
      if (!snowflake(row?.id) || row.guild_id !== guildId || !Number.isInteger(row.type)
        || row.parent_id != null && !snowflake(row.parent_id)) throw denied();
      channels.set(row.id,row);
    }
    channels.set(detail.id,detail);
    let parent;
    if (threadTypes.has(detail.type)) {
      if (!snowflake(detail.parent_id)) throw denied();
      parent = await client.getChannel({channelId:detail.parent_id,allowContainer:true,signal});
      if (parent?.id !== detail.parent_id || parent.guild_id !== guildId) throw denied();
      channels.set(parent.id,parent);
    }
    // Refresh the invoking member's own channel permissions, not just the bot's.
    // Revoked roles/private-thread membership must stop publication mid-request.
    const roleIds=new Set([guildId,...member.roles]);
    if(!roles.some(role=>role.id===guildId)||member.roles.some(id=>!roles.some(role=>role.id===id)))throw denied();
    let memberPermissions=roles.reduce((bits,role)=>roleIds.has(role.id)?bits|BigInt(role.permissions):bits,0n);
    const owner=guild.owner_id===userId;
    if(!owner && !(memberPermissions&8n)) {
      const target=parent||detail;
      if(!Array.isArray(target.permission_overwrites))throw denied();
      let roleDeny=0n,roleAllow=0n;
      for(const overwrite of target.permission_overwrites) {
        if(!snowflake(overwrite.id)||![0,1].includes(overwrite.type)
          || !/^\d+$/.test(String(overwrite.allow))||!/^\d+$/.test(String(overwrite.deny)))throw denied();
      }
      const everyone=target.permission_overwrites.find(overwrite=>overwrite.type===0&&overwrite.id===guildId);
      if(everyone)memberPermissions=(memberPermissions&~BigInt(everyone.deny))|BigInt(everyone.allow);
      for(const overwrite of target.permission_overwrites)if(overwrite.type===0&&overwrite.id!==guildId&&roleIds.has(overwrite.id)) {
        roleDeny|=BigInt(overwrite.deny);roleAllow|=BigInt(overwrite.allow);
      }
      memberPermissions=(memberPermissions&~roleDeny)|roleAllow;
      const own=target.permission_overwrites.find(overwrite=>overwrite.type===1&&overwrite.id===userId);
      if(own)memberPermissions=(memberPermissions&~BigInt(own.deny))|BigInt(own.allow);
      if(!(memberPermissions&1024n)||!(memberPermissions&65536n)||!(memberPermissions&sendPermission))throw denied();
    }
    if(detail.type===12&&!owner&&!(memberPermissions&8n)&&!(memberPermissions&(1n<<34n))) {
      const membership=await memberClient.getThreadMember({channelId,userId,signal});
      if(membership?.id!==channelId||membership.user_id!==userId)throw denied();
    }
    const safePolicy = {...policy,excludedChannelIds:[...new Set([...policy.excludedChannelIds,LEADERSHIP_CHANNEL_ID])]};
    const eligible = row => row && readable.has(row.type) && ['eboard','team'].includes(discordChannelScope(row,channels))
      && !isDiscordChannelExcluded({channel:row,channels,policy:safePolicy});
    if (!eligible(detail)) throw denied();
    const registered = catalogueResult.channels.filter(row=>row?.enabled === true && row.guildId === guildId
      && snowflake(row.channelId) && uuid(row.sourceId) && allowed.has(row.sourceId));
    if (!registered.some(row=>row.channelId === channelId)) throw denied();
    // A disabled parent cannot become an interactive destination through a thread.
    if (threadTypes.has(detail.type) && !registered.some(row=>row.channelId === detail.parent_id)) throw denied();
    const raw = new Map();
    if(rawChannels !== null) {
      if(!Array.isArray(rawChannels)||rawChannels.length>500)throw denied();
      for(const row of rawChannels){if(!snowflake(row?.id)||row.guild_id!==guildId||raw.has(row.id))throw denied();raw.set(row.id,row);}
    }
    const destinationView = viewAccessKey(parent || detail);
    const safeForAudience = row => {
      const channel=channels.get(row.channelId);
      if(!eligible(channel))return false;
      if(channel.id===channelId||channel.id===parent?.id)return true;
      // A team destination authorizes only that channel/thread and its parent
      // for ancestry readiness. Matching ACLs never sweep sibling team sources.
      if(discordChannelScope(channel,channels)==='team')return false;
      if(channel.type===12)return false; // membership differs from its parent
      const source=threadTypes.has(channel.type)?raw.get(channel.parent_id):raw.get(channel.id);
      if(!source || source.id!==(threadTypes.has(channel.type)?channel.parent_id:channel.id))return false;
      if(!threadTypes.has(channel.type)&&(source.type!==channel.type||source.parent_id!==channel.parent_id))return false;
      return destinationView!==null && viewAccessKey(source)===destinationView;
    };
    const selected = registered.filter(safeForAudience).sort((a,b)=>a.channelId.localeCompare(b.channelId));
    const sourceIds = [...new Set(selected.map(row=>row.sourceId))].sort();
    if (!sourceIds.length || sourceIds.length > 500) throw denied();
    const transport = 'discord-chat';
    const sourceProfileId = `discord-chat:${createHash('sha256').update(JSON.stringify([guildId,transport,channelId,policy.revision,
      safePolicy.excludedChannelIds,safePolicy.excludedCategoryIds,selected.map(row=>{
        const channel=channels.get(row.channelId);
        return [row.channelId,row.sourceId,channel.name,channel.type,channel.parent_id];
      }),destinationView])).digest('hex')}`;
    const label = value => String(value || userId).replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,100) || userId;
    const actor = {provider:'discord',userId,guildId,
      username:label(member.user.username),displayName:label(member.nick || member.user.global_name || member.user.username)};
    return {sourceProfileId,threadId:threadTypes.has(detail.type)?channelId:null,actor,
      principal:{id:`discord:${guildId}:${userId}`,isAdmin:false,allowedSourceIds:sourceIds,
        liveDiscord:{mode:'local-operator',guildId,transport,invokingChannelId:channelId}}};
  }
  return Object.freeze({authorize});
}
