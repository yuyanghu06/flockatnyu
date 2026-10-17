import {createHash} from 'node:crypto';
import {createEventUpdater} from '../automation/events.js';
import {canonicalJson, validUuid} from '../automation/validation.js';
import {isDiscordChannelExcluded} from './discovery.js';

const id = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const types = Object.freeze({MESSAGE_CREATE:'message_created',MESSAGE_UPDATE:'message_updated',
  MESSAGE_DELETE:'message_deleted',MESSAGE_DELETE_BULK:'messages_deleted'});
const fail = code => { throw new Error(code); };

/** Event content is never hydrated/backfilled. Partial edits and deletion IDs
 * remain exactly as Discord delivered them in payload. */
export function createDiscordEventListener({config, store, inputStore, client, refreshMetadata, now} = {}) {
  const principal = Object.freeze({id:'discord-events',guildId:config.guildId});
  async function policy(signal) {
    const result=await store.getPolicy({guildId:config.guildId,signal});
    const p=result?.policy;
    if(result?.status!=='ready'||p?.guildId!==config.guildId||!Number.isSafeInteger(p.revision)
      || !Array.isArray(p.excludedChannelIds)||!Array.isArray(p.excludedCategoryIds)
      || ![...p.excludedChannelIds,...p.excludedCategoryIds].every(id))fail('policy_unavailable');
    return p;
  }
  async function sources(signal) {
    const result=await store.listSyncChannels({signal});
    if(result?.status!=='ready'||!Array.isArray(result.channels))fail('catalogue_unavailable');
    return result.channels;
  }
  let authorized;
  const updater=createEventUpdater({store:inputStore,principal,config:{enabled:config.enabled},now,
    authorizeEvent:async({event,signal})=>{
      if(!authorized||event.source!=='discord'||event.source_id!==authorized.sourceId)return false;
      const p=await policy(signal), rows=await sources(signal);
      return !p.paused&&p.discoveryEnabled!==false&&p.revision===authorized.revision
        && rows.some(row=>row.enabled&&row.guildId===config.guildId&&row.channelId===authorized.channelId&&row.sourceId===event.source_id);
    }});
  async function handle({t,d,signal}={}) {
    if(!config.enabled)return {status:'disabled'};
    if(!types[t]||!d||d.guild_id!==config.guildId)return {status:'ignored'};
    if(!id(d.channel_id)||(t==='MESSAGE_DELETE_BULK'
      ? !Array.isArray(d.ids)||!d.ids.length||d.ids.length>100||!d.ids.every(id):!id(d.id)))fail('invalid_event');
    const p=await policy(signal);
    if(p.paused||p.discoveryEnabled===false)return {status:'ignored'};
    if(p.excludedChannelIds.includes(d.channel_id)||p.excludedCategoryIds.includes(d.channel_id))return {status:'ignored'};
    // Check live ancestry and bot permissions, including private-thread access.
    // No message-history endpoint is called by this collector.
    let channel, live, parent;
    try {
      channel=await client.getChannel({channelId:d.channel_id,signal});
      live=await client.getGuildChannels({signal});
      if([10,11,12].includes(channel?.type))parent=await client.getChannel({channelId:channel.parent_id,allowContainer:true,signal});
    } catch(error) {
      // Access can disappear between Gateway delivery and this fresh check.
      // Skip that inaccessible event without stalling every other channel.
      if(['permission_denied','not_found','channel_scope_denied'].includes(error?.code))return {status:'ignored'};
      throw error;
    }
    const validMetadata=(row,expectedId)=>row&&row.id===expectedId&&id(row.id)&&row.guild_id===config.guildId
      && Number.isInteger(row.type)&&row.type>=0&&row.type<=255&&Object.hasOwn(row,'parent_id')
      && (row.parent_id===null||id(row.parent_id));
    if(!validMetadata(channel,d.channel_id)||![0,5,10,11,12].includes(channel.type)||!Array.isArray(live)||live.length>500
      ||live.some(row=>!validMetadata(row,row?.id))||new Set(live.map(row=>row.id)).size!==live.length)fail('invalid_metadata');
    const metadata=new Map(live.map(row=>[row.id,row]));metadata.set(channel.id,channel);
    const listed=live.find(row=>row.id===channel.id);
    if(listed&&(listed.type!==channel.type||listed.parent_id!==channel.parent_id))fail('metadata_changed');
    if(parent){
      if(!validMetadata(parent,channel.parent_id)||![0,5,15,16].includes(parent.type))fail('invalid_metadata');
      const listedParent=live.find(row=>row.id===parent.id);
      if(listedParent&&(listedParent.type!==parent.type||listedParent.parent_id!==parent.parent_id))fail('metadata_changed');
      metadata.set(parent.id,parent);
    }
    if(isDiscordChannelExcluded({channel,channels:metadata,policy:p}))return {status:'ignored'};
    let rows=await sources(signal), row=rows.find(row=>row.channelId===d.channel_id&&row.guildId===config.guildId&&row.enabled);
    if(!row) {
      // New channels/threads enter via the existing metadata-only reconciliation,
      // retaining stable UUIDs and manual disabled states. Never register blindly.
      await refreshMetadata?.({signal});rows=await sources(signal);
      row=rows.find(row=>row.channelId===d.channel_id&&row.guildId===config.guildId&&row.enabled);
    }
    if(!row)return {status:'ignored'};
    if(!validUuid(row.sourceId))fail('catalogue_unavailable');
    const current=await policy(signal);
    if(current.revision!==p.revision||current.paused)fail('policy_changed');
    authorized={sourceId:row.sourceId,channelId:row.channelId,revision:current.revision};
    const revision=createHash('sha256').update(canonicalJson(d)).digest('hex');
    try {
      const result=await updater.enqueue({source:'discord',sourceId:row.sourceId,eventType:types[t],
        eventId:t==='MESSAGE_DELETE_BULK'?`${d.channel_id}:${revision}`:d.id,revision,payload:d,signal});
      if(!['queued','duplicate'].includes(result.status))fail(result.status==='forbidden'?'policy_changed':'enqueue_failed');
      return result;
    } finally {authorized=null;}
  }
  // Explicitly serialize the authorization context even for injected callers.
  let pending=Promise.resolve();
  return Object.freeze({handle(event) {const next=pending.then(()=>handle(event));pending=next.catch(()=>{});return next;}});
}
