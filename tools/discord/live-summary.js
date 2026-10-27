import {createTimeContext} from '../../server/shared/time-zone.js';
import { createLiveRetrievalTools, validateLiveDiscordArguments } from './index.js';
import { summarizeLiveDiscordEvidence } from '../../server/discord/live-summary-runner.js';
import { createDiscordSummaryProvider, SUMMARY_FIELDS } from '../../server/discord/summary-provider.js';

// Interactive summaries reuse the verified RAM-only map/reduce path. A bounded
// per-request budget prevents a large live window from creating unbounded work.
export function createLiveChatTools({ service, guildId, config, provider } = {}) {
  const reads = createLiveRetrievalTools({ service, guildId });
  const summaryProvider = provider || createDiscordSummaryProvider({ config });
  const requestBudgets = new WeakMap();
  const summaryTool = Object.freeze({name:'read_discord_summary',description:'Summarize all authorized eboard channels over a requested window in one bounded live scan. FIRST choice for broad Discord updates. Default scope=eboard; general is secondary fallback and excludes teams; team requires an explicit user request. For one requested team channel, supply scope=team and the exact channelId resolved from list_discord_channels; only that channel is read. Defaults to last seven local calendar dates when from/to omitted. Inspect per-channel coverage; no claim of complete server or thread coverage.',parameters:{type:'object',additionalProperties:false,properties:{scope:{type:'string',enum:['eboard','general','team']},channelId:{type:'string',pattern:'^[0-9]{1,20}$',description:'Optional exact channel ID from the live catalogue; allowed only with scope=team. Never guess IDs.'},from:{type:'string'},to:{type:'string'},timeZone:{type:'string',maxLength:100}}}});
  async function summarizeScope(options) {
    const args=options.arguments;
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!['scope','channelId','from','to','timeZone'].includes(key))||args.scope!==undefined&&!['eboard','general','team'].includes(args.scope))return {status:'invalid_request',sources:[]};
    if(args.channelId!==undefined&&(args.scope!=='team'||typeof args.channelId!=='string'||!/^[0-9]{1,20}$/.test(args.channelId)))return {status:'invalid_request',sources:[]};
    const time=createTimeContext(options.timeContext);
    if(!time)return {status:'invalid_request',sources:[]};
    const localStart=new Date(`${time.localDate}T00:00:00Z`);localStart.setUTCDate(localStart.getUTCDate()-6);
    const windowArgs={channelId:args.channelId??'1',from:args.from??localStart.toISOString().slice(0,10),to:args.to??time.now,...(args.timeZone?{timeZone:args.timeZone}:{})};
    const validated=validateLiveDiscordArguments('read_discord_window',windowArgs,guildId,time);
    if(!validated)return {status:'invalid_request',sources:[]};
    // An exact team channel reuses the window reader's current-source, explicit
    // user-intent and exclusion checks without scanning other team channels.
    if(args.channelId!==undefined)return summarizeWindow({...options,name:'read_discord_window',arguments:windowArgs});
    const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(300000)]):AbortSignal.timeout(300000);
    const scope=args.scope||'eboard';
    const catalogue=await service.getCatalogue({scope,principal:options.principal,signal,...(typeof options.userMessage==='string'?{userMessage:options.userMessage}:{})});
    if(catalogue.status!=='ready')return {...catalogue,sources:[]};
    const channels=(catalogue.channels||[]).slice(0,30),results=new Array(channels.length);let index=0;
    if(!channels.length)return {status:'unavailable',sources:[],scope,channelCoverage:[],coverage:{complete:false,from:validated.from,to:validated.to,timeZone:validated.timeZone,reason:catalogue.reason||'no_authorized_channels'}};
    while(index<channels.length&&!signal.aborted){const position=index++,channel=channels[position];
        try{results[position]=await summarizeWindow({...options,name:'read_discord_window',signal,budgetSignal:options.budgetSignal||options.signal||signal,arguments:{...windowArgs,channelId:channel.channelId??channel.id}});}
        catch{results[position]={status:'unavailable',sources:[],coverage:{complete:false,reason:'unavailable'}};}
    }
    const sources=[],channelCoverage=[];let remaining=18000,omitted=false;
    channels.forEach((channel,i)=>{const result=results[i]||{status:'aborted',coverage:{complete:false,reason:'request_budget'}};
      let retained=0;
      for(const source of result.sources||[]){if(sources.length>=24||remaining<=0){omitted=true;continue;}const excerpt=String(source.excerpt||'').slice(0,Math.min(1800,remaining));remaining-=excerpt.length;retained++;sources.push({...source,excerpt,...(excerpt.length<String(source.excerpt||'').length?{partial:true}:{})});}
      channelCoverage.push({channelId:channel.channelId??channel.id,name:channel.name,status:result.status,complete:result.coverage?.complete===true,returnedCount:result.coverage?.returnedCount??0,retainedSources:retained,reason:result.coverage?.reason??null});
    });
    const complete=catalogue.complete!==false&&!signal.aborted&&!omitted&&channelCoverage.every(row=>row.complete);
    return {status:complete?'ready':'partial',sources,scope,channelCoverage,coverage:{complete,from:validated.from,to:validated.to,timeZone:validated.timeZone,channelCoverageComplete:catalogue.complete!==false&&channelCoverage.every(row=>row.complete),returnedCount:sources.length,matchedCount:channelCoverage.reduce((sum,row)=>sum+row.returnedCount,0),textTruncated:omitted,contentScope:'top_level_text_only',nonTextMessageCount:results.reduce((sum,row)=>sum+(row?.coverage?.nonTextMessageCount||0),0),reason:complete?'authorized_scope_window_only':'bounded_scope_read'},notice:'Coverage applies only to the listed authorized channels and window. Thread contents are included only when independently registered, selected and read; no full-server claim.'};
  }
  // This separate path is reachable only through the explicitly named summary
  // tool. Ordinary window reads always return the original-message projection.
  async function summarizeWindow(options) {
    if (options.name !== 'read_discord_window' || !config?.configured || summaryProvider.configured === false) return reads.execute(options);
    const requestTime = createTimeContext(options.timeContext);
    const args = requestTime && validateLiveDiscordArguments(options.name, options.arguments, guildId, requestTime);
    if (!args) return { status: 'invalid_request', sources: [] };
    const rawFetched = await service.fetchWindow({ ...args, principal: options.principal, signal: options.signal, timeContext:requestTime,...(typeof options.userMessage==='string'?{userMessage:options.userMessage}:{}) });
    const fetched = {...rawFetched,coverage:{...rawFetched?.coverage,timeZone:args.timeZone,from:args.from,to:args.to}};
    const { messages = [], ...visible } = fetched;
    if (fetched.status !== 'ready' || !fetched.coverage?.complete) return visible;
    const rawChars = messages.reduce((sum, message) => sum + message.content.length, 0);
    if (messages.length <= 8 && rawChars <= 10000 && fetched.coverage.sourceTextTruncated !== true) return visible;
    const budgetSignal=options.budgetSignal||options.signal;
    let budget = budgetSignal ? requestBudgets.get(budgetSignal) : null;
    if (!budget) {
    let allocated = 0, calls = 0;
    const reservations = new Map();
    budget = {
      async reserveRequest({ reservationId, maxCostUsd }) {
        if (budgetSignal?.aborted) return { status: 'aborted' };
        if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || calls >= 12 || allocated + maxCostUsd > 0.1) return { status: 'budget_exhausted' };
        allocated += maxCostUsd; calls++; reservations.set(reservationId, true);
        return { status: 'ready', reservationId, dispatchAllowed: true };
      },
      async commitUsage({ reservationId }) { return { status: reservations.has(reservationId) ? 'ready' : 'stale' }; },
    };
    if (budgetSignal) requestBudgets.set(budgetSignal, budget);
    }
    try {
      const evidence = messages.map(message => ({ messageId: message.id, channelId: args.channelId,
        createdAt: message.timestamp, editedAt: message.edited_timestamp, authorId: message.author.id,
        authorName: message.author.name, content: message.content, replyToMessageId: message.replyToMessageId,
        nonTextNotice: message.hasNonTextContent ? 'Non-text contents were not fetched.' : null,
        url: `https://discord.com/channels/${guildId}/${args.channelId}/${message.id}` }));
      const summary = await summarizeLiveDiscordEvidence({ messages: evidence, config, provider: summaryProvider, store: budget,
        signal: options.signal });
      if (summary.status !== 'ready') return { ...visible, status: 'partial', coverage: { ...visible.coverage, complete: false, reason: summary.status } };
      const sources = SUMMARY_FIELDS.flatMap(field => summary.summary[field].map((finding, index) => ({
        id: `discord-live-summary:${args.channelId}:${args.from}:${args.to}:${field}:${index}`, kind: 'discord_live_summary',
        title: `#${fetched.channel?.name || args.channelId} · ${field}`, excerpt: finding.text,
        url: `https://discord.com/channels/${guildId}/${args.channelId}/${finding.messageIds[0]}`,
        guildId, channelId: args.channelId, periodStart: args.from, periodEnd: args.to, timeZone:args.timeZone,
        retrievalMode: 'live_bot_summary', fetchedAt: requestTime.now,
      })));
      return { status: 'ready', sources, coverage: { ...visible.coverage, complete: true, fetchedComplete: true,
        sourceTextTruncated: false, directSummary: true, returnedCount: messages.length, reason: null } };
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      return { status: 'partial', sources: visible.sources, coverage: { ...visible.coverage, complete: false, reason: 'live_summary_unavailable' } };
    }
  }
  async function execute(options) {
    return options.name==='read_discord_summary'?summarizeScope(options):reads.execute(options);
  }
  return Object.freeze({ tools: Object.freeze([...reads.tools,summaryTool]), execute });
}
