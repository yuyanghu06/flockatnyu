import {canonicalJson} from '../../server/automation/validation.js';
import {sourceMailbox} from '../../server/google/mailbox.js';
import {requestsMapUpdate} from '../../server/map/chat-intent.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const strip = (row, relation = false) => Object.fromEntries(Object.entries(row || {}).filter(([key,value]) =>
  !['created_at','updated_at',...(relation ? ['event_id'] : [])].includes(key) && value !== null));
const same = (a,b) => canonicalJson(a) === canonicalJson(b);
const forbidden = () => ({status:'forbidden_source'});

// The service still rechecks current source access at commit. This additional
// request-local gate requires original evidence to have reached THIS chat turn.
// Direct stateless tool requests cannot carry model-invented evidence receipts.
export function createChatMapTools({mapTools, gmailSourceId} = {}) {
  function createRequest(context = {}) {
    const {userMessage = ''} = context;
    const mutationRequested = !Object.hasOwn(context,'userMessage') || requestsMapUpdate(userMessage);
    const personalRequest = /\b(me|my|mine|myself|we|us|our|ours|ourselves|i am|i['’]?m|we are|we['’]?re)\b/i.test(userMessage);
    const explicitSources = new Set();
    for (const candidate of userMessage.match(/https:\/\/[^\s<>"`]+/gi) || []) {
      try {
        const url = new URL(candidate.replace(/[),.!?;:]+$/u,''));
        if (url.protocol==='https:' && !url.username && !url.password
          && ['discord.com','miro.com','mail.google.com','calendar.google.com'].includes(url.hostname)) explicitSources.add(url.href);
      } catch { /* An invalid reference never identifies the chat user. */ }
    }
    const missingChatIdentity = personalRequest && !explicitSources.size;
    const observed = new Set(), calendarIdentities = new Map(), providerIdentities = new Map(), identities = new Map(), snapshots = new Map(), writtenSources = new Set();
    const key = (sourceId,url) => JSON.stringify([sourceId,url]);
    const creationKey = args => {
      const event=args.event||{};
      if (!/^https:\/\/discord\.com\/channels\/[0-9]+\/[0-9]+\/[0-9]+$/.test(event.source_url||'')) return key(event.source_id,`${event.source_url}\0${event.source_record_id}`);
      // Different explicit windows/locations from one message remain distinct;
      // a renamed provider key for the same activity does not create it twice.
      return JSON.stringify([event.source_id,event.source_url,event.kind,event.time_kind,
        event.starts_at?Date.parse(event.starts_at):event.starts_on??null,event.ends_at?Date.parse(event.ends_at):event.ends_on??null,
        (args.buildings||[]).map(row=>row.building_id).sort()]);
    };
    function observe(name,result) {
      if (!['ready','partial'].includes(result?.status)) return;
      const sources = [];
      for (const source of result.sources || []) {
        sources.push(source);
        const selectedCalendar = ['list_calendar_events','read_calendar_event'].includes(name);
        if (typeof source?.url !== 'string' || source.partial === true && !selectedCalendar
          && !(name === 'read_gmail' && source.contentStatus === 'text_only_bounded')) continue;
        let sourceId = source.sourceId, original = false;
        if (['read_discord_messages','read_discord_window','read_discord_summary','search_discord'].includes(name)) {
          original = source.kind === 'discord' && source.retrieval === 'live'
            && typeof source.messageId === 'string'
            && source.url === `https://discord.com/channels/${source.guildId}/${source.channelId}/${source.messageId}`;
        } else if (name === 'read_miro_item') {
          original = source.kind === 'miro' && source.retrievalMode === 'live' && source.contentAvailable === true
            && ['item','table_row'].includes(source.evidenceKind) && typeof source.sourceKey === 'string'
            && typeof source.itemId === 'string' && source.url === `https://miro.com/app/board/${encodeURIComponent(source.boardId)}/?moveToWidget=${encodeURIComponent(source.itemId)}`;
        } else if (name === 'read_gmail') {
          sourceId = gmailSourceId;
          original = source.kind === 'gmail' && typeof source.externalId === 'string'
            && source.url === `https://mail.google.com/mail/u/0/#all/${source.externalId}`;
        } else if (['list_calendar_events','read_calendar_event'].includes(name)) {
          original = source.kind === 'google_calendar' && source.retrievalMode === 'live'
            && result.calendarContext?.events?.some(event => event.eventId === source.externalId && event.url === source.url);
        }
        if (original && uuid(sourceId)) {
          // Gmail's generic reader does not know the configured catalogue UUID.
          // Add only the server-configured identity after an actual body read.
          if (name === 'read_gmail') sources[sources.length - 1] = {...source,sourceId};
          const evidenceKey = key(sourceId,source.url);
          observed.add(evidenceKey);
          if (source.kind === 'google_calendar') calendarIdentities.set(evidenceKey,source.externalId);
          const linked = providerIdentities.get(evidenceKey) || new Set();
          if (source.kind === 'discord' && typeof source.authorId === 'string') linked.add(`discord:${source.authorId}`);
          if (source.kind === 'gmail' && typeof source.from === 'string') {
            const email = sourceMailbox(source.from);
            if (email) linked.add(`email:${email}`);
          }
          providerIdentities.set(evidenceKey,linked);
        }
      }
      return {...result,sources};
    }
    const supported = row => observed.has(key(row?.source_id,row?.source_url));
    async function execute(options = {}) {
      const {name,arguments:args = {}} = options;
      if (name==='upsert_map_event' && !mutationRequested) return {status:'forbidden',reason:'map_update_not_requested'};
      if (missingChatIdentity && ['lookup_map_person','upsert_map_event'].includes(name)) return {
        status:'forbidden_source',reason:'unverified_chat_identity',
        notice:'A matching retrieved message author is not the chat user. Supply an explicit original source reference; this chat has no trusted linked personal identity.',
      };
      if (personalRequest && name==='lookup_map_person' && !explicitSources.has(args.sourceUrl)) return {
        status:'forbidden_source',reason:'unverified_chat_identity',notice:'Only the exact original source explicitly supplied by the user may resolve this personal request.',
      };
      const lookupEvidence = key(args.sourceId,args.sourceUrl);
      const providerIdentity = `${args.provider}:${args.provider === 'email' ? args.providerUserId?.toLowerCase() : args.providerUserId}`;
      if (name === 'lookup_map_person' && (!observed.has(lookupEvidence) || !providerIdentities.get(lookupEvidence)?.has(providerIdentity))) return forbidden();
      if (name === 'upsert_map_event') {
        if (!args.event?.id && args.event?.kind==='presence' && args.event?.time_kind!=='timed') return {
          status:'invalid_request',reason:'current_presence_requires_timed_window',
        };
        if (!args.event?.id && writtenSources.has(creationKey(args))) return {
          status:'conflict',reason:'source_already_written',notice:'This original source already created an event in this request. Read and update that same event; never rename its source_record_id to create another.',
        };
        if (personalRequest && (!Array.isArray(args.people) || !args.people.some(person=>
          explicitSources.has(person.source_url) && identities.get(person.person_id)?.has(key(person.source_id,person.source_url))))) return {
          status:'forbidden_source',reason:'unverified_chat_identity',notice:'This personal map request needs an exact linked author from the user-supplied original source.',
        };
        const calendarId = calendarIdentities.get(key(args.event?.source_id,args.event?.source_url));
        if (calendarId !== undefined && args.event?.source_record_id !== calendarId) return forbidden();
        const previous = args.event?.id ? snapshots.get(args.event.id) : null;
        if (args.event?.id && !previous) return forbidden();
        if (previous && previous.event.updated_at !== args.expectedUpdatedAt) return {status:'conflict'};
        if (!Array.isArray(args.people) || !Array.isArray(args.buildings)) return {status:'invalid_request'};
        const buildings = rows => rows.map(row=>strip(row,true)).sort((a,b)=>String(a.building_id).localeCompare(String(b.building_id)));
        const eventChanged = !previous || !same(strip(previous.event),args.event);
        const buildingsChanged = !previous || !same(buildings(previous.buildings),buildings(args.buildings));
        if ((eventChanged || buildingsChanged) && !supported(args.event)) return forbidden();
        let participationChanged = false;
        for (const person of args.people) {
          const prior = previous?.people.find(row=>row.person_id === person.person_id);
          if (prior && same(strip(prior,true),person)) continue;
          if (!supported(person) || !identities.get(person.person_id)?.has(key(person.source_id,person.source_url))) return forbidden();
          participationChanged = true;
        }
        if (previous?.people.some(row=>!args.people.some(person=>person.person_id === row.person_id))) return forbidden();
        if (!eventChanged && !buildingsChanged && !participationChanged && !supported(args.event)) return forbidden();
        // Creation must follow a current catalogue read even with no attendees.
        if (!snapshots.has('catalogue')) return forbidden();
      }
      const result = await mapTools.execute(options);
      if (name === 'upsert_map_event' && result?.status==='ready' && result.sourceStatus==='applied') writtenSources.add(creationKey(args));
      if (name === 'read_map_events' && result?.status === 'ready' &&
        ['events','event_buildings','event_people','buildings','people','event_types'].every(field=>Array.isArray(result[field])) &&
        Buffer.byteLength(JSON.stringify(result)) <= 64000) {
        snapshots.set('catalogue',true);
        for (const event of result.events) snapshots.set(event.id,{event,buildings:result.event_buildings.filter(row=>row.event_id === event.id),people:result.event_people.filter(row=>row.event_id === event.id)});
      }
      if (name === 'lookup_map_person' && result?.status === 'ready' && uuid(result.person?.id)) {
        const evidence = identities.get(result.person.id) || new Set();evidence.add(lookupEvidence);identities.set(result.person.id,evidence);
      }
      return result;
    }
    return {tools:mapTools?.tools || [],execute,observe};
  }
  return Object.freeze({configured:mapTools?.configured === true,tools:mapTools?.tools || [],createRequest,
    execute:options=>options?.name === 'read_map_events' ? mapTools.execute(options) : Promise.resolve(forbidden())});
}
