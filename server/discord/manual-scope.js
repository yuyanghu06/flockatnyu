// Trusted worker-only view. It neither changes the published catalogue nor
// expands ordinary chat/map visibility. No message content is imported here.
const snowflake=value=>typeof value==='string'&&/^[0-9]{1,20}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const readable=new Set([0,5,10,11,12]),threads=new Set([10,11,12]);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const safeCodes=new Set(['aborted','not_configured','paused','disabled','not_found','permission_denied','channel_scope_denied','policy_changed','manual_scope_denied','rate_limited','invalid_token','discord_unavailable']);
const safe=error=>safeCodes.has(error?.code)?error.code:'manual_scope_denied';

export function createManualDiscordStore({store,client,guildId,channelIds}={}) {
  if(!snowflake(guildId)||!Array.isArray(channelIds)||!channelIds.length||channelIds.length>30
    ||channelIds.some(value=>!snowflake(value))||new Set(channelIds).size!==channelIds.length)fail('invalid_request');
  const selected=Object.freeze([...channelIds]);
  async function snapshot(signal) {
    if(signal?.aborted)fail('aborted');
    if(!store?.getManualScopeMetadata||!client?.getGuildChannels||!client?.getChannel)fail('not_configured');
    const [loaded,listed]=await Promise.all([
      store.getManualScopeMetadata({guildId,channelIds:selected,signal}),client.getGuildChannels({signal})]);
    if(loaded?.status!=='ready')fail(safeCodes.has(loaded?.status)?loaded.status:'manual_scope_denied');
    const data=loaded.metadata;
    if(data?.guildId!==guildId||!Number.isSafeInteger(data.policyRevision)||data.policyRevision<1
      ||typeof data.paused!=='boolean'||typeof data.discoveryEnabled!=='boolean')fail('manual_scope_denied');
    if(data.paused)fail('paused');
    if(!data.discoveryEnabled)fail('disabled');
    if(!uuid(data.publishedGeneration)||data.publishedRevision!==data.policyRevision
      ||!Array.isArray(data.nodes)||data.nodes.length>270)fail('manual_scope_denied');
    if(!Array.isArray(listed)||listed.length>500)fail('manual_scope_denied');
    const nodes=new Map(),live=new Map();
    for(const row of data.nodes) {
      if(!snowflake(row?.channelId)||row.guildId!==guildId||nodes.has(row.channelId)
        ||!Number.isInteger(row.type)||row.parentId!==null&&!snowflake(row.parentId)
        ||row.sourceId!==null&&!uuid(row.sourceId)||typeof row.manualDisabled!=='boolean'
        ||typeof row.withdrawn!=='boolean'||row.generation!==data.publishedGeneration)fail('manual_scope_denied');
      nodes.set(row.channelId,row);
    }
    for(const row of listed) {
      if(!snowflake(row?.id)||row.guild_id!==guildId||live.has(row.id)||!Number.isInteger(row.type)
        ||!Object.hasOwn(row,'parent_id')||row.parent_id!==null&&!snowflake(row.parent_id))fail('manual_scope_denied');
      live.set(row.id,row);
    }
    const checked=new Map();
    const detail=async(id,allowContainer=false)=>{
      if(checked.has(id))return checked.get(id);
      const row=await client.getChannel({channelId:id,allowContainer,signal});
      if(row?.id!==id||row.guild_id!==guildId||!Number.isInteger(row.type)
        ||!Object.hasOwn(row,'parent_id')||row.parent_id!==null&&!snowflake(row.parent_id))fail('channel_scope_denied');
      const listed=live.get(id);
      if(listed&&(listed.type!==row.type||listed.parent_id!==row.parent_id))fail('policy_changed');
      checked.set(id,row);return row;
    };
    const channels=[];
    for(const id of selected) {
      const first=nodes.get(id);
      if(!first)fail('not_found');
      if(!readable.has(first.type)||first.policyRevision!==data.policyRevision)fail('channel_scope_denied');
      let current=id,childType=null;const visited=new Set();
      while(current!==null) {
        if(visited.has(current)||visited.size>=9)fail('manual_scope_denied');
        visited.add(current);
        const node=nodes.get(current);
        if(!node||node.manualDisabled||node.withdrawn||!['ready','metadata','excluded'].includes(node.accessStatus))fail('manual_scope_denied');
        if(childType!==null&&(threads.has(childType)?![0,5,15,16].includes(node.type):node.type!==4))fail('channel_scope_denied');
        const actual=node.type===4?live.get(current):await detail(current,current!==id);
        if(!actual||actual.type!==node.type||actual.parent_id!==node.parentId)fail('policy_changed');
        if(node.type===4&&node.parentId!==null||threads.has(node.type)&&node.parentId===null)fail('channel_scope_denied');
        childType=node.type;current=node.parentId;
      }
      // A previously excluded node can have no UUID and therefore no queued
      // input identity. Validate it, but never create a new identity or grant.
      if(first.sourceId)channels.push({guildId,channelId:id,sourceId:first.sourceId,title:first.title,
        enabled:true,policyRevision:data.policyRevision});
    }
    if(new Set(channels.map(row=>row.sourceId)).size!==channels.length)fail('manual_scope_denied');
    if(signal?.aborted)fail('aborted');
    return {policy:{guildId,revision:data.policyRevision,paused:false,discoveryEnabled:true,
      excludedCategoryIds:[],excludedChannelIds:[]},channels};
  }
  return Object.freeze({configured:store?.configured!==false,
    async getAuthorizationSnapshot({guildId:requested,signal}={}) {
      if(requested!==guildId)return {status:'forbidden',policy:null,channels:[]};
      // One fresh validated result supplies one policy/catalogue pair only.
      // Each later boundary, including the final recheck, calls snapshot anew.
      try{return {status:'ready',...await snapshot(signal)};}
      catch(error){return {status:safe(error),policy:null,channels:[]};}
    },
    async getPolicy({guildId:requested,signal}={}) {
      if(requested!==guildId)return {status:'forbidden',policy:null};
      try{return {status:'ready',policy:(await snapshot(signal)).policy};}
      catch(error){return {status:safe(error),policy:null};}
    },
    async listSyncChannels({signal}={}) {
      try{return {status:'ready',channels:(await snapshot(signal)).channels};}
      catch(error){return {status:safe(error),channels:[]};}
    },
    async resolveSourceIds({signal}={}) {return (await snapshot(signal)).channels.map(row=>row.sourceId).sort();},
  });
}
