const snowflake=value=>typeof value==='string'&&/^[0-9]{1,20}$/.test(value);
const textTypes=new Set([0,5,10,11,12]),containerTypes=new Set([0,5,15,16]),threads=new Set([10,11,12]);
const denied=new Set(['permission_denied','not_found']);
const fail=()=>{throw new Error('metadata_reconcile_failed');};
const valid=(row,guildId)=>row&&snowflake(row.id)&&row.guild_id===guildId&&Number.isInteger(row.type)
  &&Object.hasOwn(row,'parent_id')&&(row.parent_id===null||snowflake(row.parent_id));
const record=(row,accessStatus,eligible=false)=>({channelId:row.id,guildId:row.guild_id,parentId:row.parent_id,
  type:row.type,title:typeof row.name==='string'&&row.name.trim()?row.name.slice(0,300):`Discord ${row.id}`,accessStatus,eligible});

/** Recheck only a native event's channel and its ancestry. The background archive
 * inventory never blocks this path, and no source message is fetched or stored. */
export function createDiscordMetadataReconcile({config,store,client}={}) {
  async function reconcile({channelId,eventType,signal}={}) {
    if(signal?.aborted||!snowflake(channelId))fail();
    const loaded=await store.getPolicy({guildId:config.guildId,signal}),p=loaded?.policy;
    if(loaded?.status!=='ready'||p?.guildId!==config.guildId||!Number.isSafeInteger(p.revision)||p.revision<1
      ||!Array.isArray(p.excludedCategoryIds)||!Array.isArray(p.excludedChannelIds))fail();
    if(p.paused||p.discoveryEnabled!==true)return {status:'ready',allowed:false};
    const loadedSnapshot=await store.getEventMetadataSnapshot({guildId:config.guildId,expectedPolicyRevision:p.revision,signal});
    if(loadedSnapshot?.status!=='ready'||!loadedSnapshot.snapshot)fail();
    const expectedSnapshot=loadedSnapshot.snapshot;
    async function publish(channels=[],withdraw=false) {
      if(signal?.aborted)fail();
      const result=await store.reconcileEventMetadata({guildId:config.guildId,expectedPolicyRevision:p.revision,
        channelId,channels,withdraw,expectedSnapshot,signal});
      if(result?.status!=='ready'||typeof result.allowed!=='boolean')fail();
      return result;
    }
    if(['CHANNEL_DELETE','THREAD_DELETE'].includes(eventType))return publish([],true);
    const snapshot=await client.getGuildChannels({signal});
    if(!Array.isArray(snapshot)||snapshot.length>500||snapshot.some(n=>!valid(n,config.guildId))
      ||new Set(snapshot.map(n=>n.id)).size!==snapshot.length)fail();
    const map=new Map(snapshot.map(n=>[n.id,n]));
    let target=map.get(channelId);
    if(target&&[2,13].includes(target.type))return publish([],true);
    // Categories have metadata visibility only. Every readable channel/thread
    // still passes the ordinary effective bot-permission check in getChannel.
    if(target?.type!==4){
      try {
        const fresh=await client.getChannel({channelId,allowContainer:true,signal});
        if(!valid(fresh,config.guildId)||fresh.id!==channelId)fail();
        if(target&&(target.type!==fresh.type||target.parent_id!==fresh.parent_id))fail();
        target=fresh;map.set(channelId,target);
      }catch(error){if(denied.has(error?.code))return publish([],true);throw error;}
    }
    if(!target)fail();
    const chain=[],seen=new Set();let node=target,child;
    while(node) {
      if(!valid(node,config.guildId)||seen.has(node.id)||seen.size>=3)fail();
      if(child&&(threads.has(child.type)?!containerTypes.has(node.type):node.type!==4))fail();
      seen.add(node.id);
      let checked=node;
      if(node.id!==target.id&&node.type!==4){
        try {
          checked=await client.getChannel({channelId:node.id,allowContainer:true,signal});
          if(!valid(checked,config.guildId)||checked.id!==node.id||checked.type!==node.type||checked.parent_id!==node.parent_id)fail();
        }catch(error){if(denied.has(error?.code)){
          chain.push(record(node,error.code==='not_found'?'not_found':'permission_denied'));
          // Include its category to prove the exact path; target cannot become
          // eligible through a denied ancestor.
          const category=node.parent_id===null?null:map.get(node.parent_id);
          if(node.parent_id!==null&&(!category||category.type!==4||category.parent_id!==null))fail();
          if(category)chain.push(record(category,'metadata'));
          return publish(chain.reverse());
        }throw error;}
      }
      if(node.type===4){if(node.parent_id!==null)fail();chain.push(record(node,'metadata'));break;}
      if(!textTypes.has(node.type)&&!containerTypes.has(node.type))fail();
      chain.push(record(checked,'ready',textTypes.has(node.type)));
      if(node.parent_id===null){if(threads.has(node.type))fail();break;}
      child=node;node=map.get(node.parent_id);
      if(!node)fail();
    }
    return publish(chain.reverse());
  }
  return Object.freeze({reconcile});
}
