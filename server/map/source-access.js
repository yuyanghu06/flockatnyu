// Source references are evidence, never grants. Reuse the existing source
// services so map visibility follows their current server-owned access policy.
import {createMapEventStore,validateSnapshot,validEvent,text} from './events.js';
import {chatAttendanceOrigin,chatAttendanceReference} from './chat-attendance.js';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function createMapSourceAuthorizer({liveDiscordService, miroStore, googleClient, gmailSourceId, calendarClient, calendarSourceId,
  env=process.env,store=createMapEventStore({env}),publicOrigin=env.PUBLIC_ORIGIN,now=()=>new Date()} = {}) {
  const attendanceOrigin=chatAttendanceOrigin(publicOrigin);
  async function authorizeSource({principal, sourceId, sourceUrl, eventId, personId, signal} = {}, scope=null) {
    if (signal?.aborted || typeof principal?.id !== 'string' || !principal.id || !uuid(sourceId)
      || !Array.isArray(principal.allowedSourceIds) || !principal.allowedSourceIds.includes(sourceId)
      || typeof sourceUrl !== 'string' || sourceUrl.length > 2048) return false;
    try {
      const url = new URL(sourceUrl);
      if (url.protocol !== 'https:' || url.username || url.password) return false;
      if(attendanceOrigin&&url.origin===attendanceOrigin) {
        const reference=chatAttendanceReference(sourceUrl,attendanceOrigin);
        // Bind this declaration to the actual relation being read/written;
        // another existing person or event cannot borrow its valid marker.
        if(!reference||reference.eventId!==eventId||reference.personId!==personId||store?.configured!==true)return false;
        const data=scope?.snapshot??validateSnapshot(await store.read({observedAt:new Date(now()).toISOString(),signal}));
        const event=data.events.find(row=>row.id===reference.eventId),person=data.people.find(row=>row.id===reference.personId);
        if(!event||!validEvent(event)||event.kind!=='scheduled_event'||event.source_id!==sourceId
          ||person?.is_trackable!==true||!text(person.display_name,200,1))return false;
        // A chat declaration inherits the event's access scope, not its authorship.
        // Only an original supported provider reference may authorize the marker.
        const original=new URL(event.source_url);
        if(!['https://discord.com','https://calendar.google.com','https://miro.com','https://mail.google.com'].includes(original.origin)
          ||original.origin===attendanceOrigin)return false;
        return !signal?.aborted&&await authorizeSource({principal,sourceId,sourceUrl:event.source_url,signal},scope)===true;
      }
      // Only original provider checks are shared. Declaration bindings above are
      // checked for the exact event/person on every invocation, before reuse.
      if(scope) {
        const key=JSON.stringify([sourceId,sourceUrl]);
        if(!scope.originals.has(key))scope.originals.set(key,authorizeOriginal({principal,sourceId,sourceUrl,signal},url));
        return !signal?.aborted&&await scope.originals.get(key)===true&&!signal?.aborted;
      }
      return await authorizeOriginal({principal,sourceId,sourceUrl,signal},url);
    } catch { return false; }
  }
  async function authorizeOriginal({principal,sourceId,sourceUrl,signal},url) {
    try {
      if (url.origin === 'https://calendar.google.com') {
        if (!uuid(calendarSourceId) || sourceId !== calendarSourceId || !calendarClient?.configured
          || typeof calendarClient.calendarId !== 'string' || !calendarClient.calendarId || calendarClient.calendarId === 'primary'
          || !(principal.googleAccess === true || principal.calendarAccess === true && principal.calendarId === calendarClient.calendarId)
          || url.pathname !== '/calendar/event' || url.hash || [...url.searchParams.keys()].join(',') !== 'eid') return false;
        const encoded = url.searchParams.get('eid');
        if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) return false;
        const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
        const suffix = ` ${calendarClient.calendarId}`;
        if (!decoded.endsWith(suffix)) return false;
        const eventId = decoded.slice(0, -suffix.length);
        if (!/^[a-zA-Z0-9_-]{5,1024}$/.test(eventId)
          || sourceUrl !== `https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId}${suffix}`).toString('base64url')}`) return false;
        const result = await calendarClient.readEvent({eventId, signal,
          principal:{id:principal.id,calendarAccess:true,calendarId:calendarClient.calendarId}});
        return !signal?.aborted && result?.status === 'ready' && result.events?.some(event =>
          event.eventId === eventId && event.url === sourceUrl) === true;
      }
      if (url.origin === 'https://discord.com') {
        const match = /^\/channels\/([0-9]{1,20})\/([0-9]{1,20})\/([0-9]{1,20})$/.exec(url.pathname);
        if (!match || url.search || url.hash || sourceUrl !== `https://discord.com${url.pathname}`
          || principal.liveDiscord?.guildId !== match[1] || !liveDiscordService?.configured) return false;
        // The live service checks enabled catalogue entries, thread ancestry,
        // bot access, exclusions and a final catalogue/policy recheck.
        const result = await liveDiscordService.readMessages({principal, channelId:match[2], messageId:match[3], context:false, limit:1, signal});
        return !signal?.aborted && result?.status === 'ready' && result.sources?.some(source =>
          source.sourceId === sourceId && source.url === sourceUrl && source.guildId === match[1]
          && source.channelId === match[2] && source.messageId === match[3]) === true;
      }
      if (url.origin === 'https://miro.com') {
        const match = /^\/app\/board\/([A-Za-z0-9_=%-]+)\/$/.exec(url.pathname);
        if (!match || url.hash || !miroStore?.configured) return false;
        const boardId = decodeURIComponent(match[1]);
        if (!/^[A-Za-z0-9_=-]{1,200}$/.test(boardId)) return false;
        const itemId = url.searchParams.get('moveToWidget');
        if (itemId !== null && !/^[A-Za-z0-9_=-]{1,200}$/.test(itemId)) return false;
        const canonical = `https://miro.com/app/board/${encodeURIComponent(boardId)}/${itemId === null ? '' : `?moveToWidget=${encodeURIComponent(itemId)}`}`;
        if (sourceUrl !== canonical) return false;
        const result = await miroStore.authorizedBoard({principal, boardId, signal});
        return !signal?.aborted && result?.status === 'ready' && result.data?.board_id === boardId && result.data.source_id === sourceId;
      }
      if (url.origin === 'https://mail.google.com') {
        const match = /^#all\/([a-fA-F0-9]{1,64})$/.exec(url.hash);
        if (!match || url.pathname !== '/mail/u/0/' || url.search || sourceId !== gmailSourceId
          || !uuid(gmailSourceId) || principal.googleAccess !== true || !googleClient?.configured
          || sourceUrl !== `https://mail.google.com/mail/u/0/#all/${match[1]}`) return false;
        const result = await googleClient.readGmail({messageId:match[1], signal});
        return !signal?.aborted && result?.status === 'ready' && result.sources?.some(source =>
          source.kind === 'gmail' && source.externalId === match[1] && source.url === sourceUrl) === true;
      }
      return false;
    } catch { return false; }
  }
  // A projection owns its snapshot and in-flight originals. General event reads
  // and writes keep using the uncached callback, so later calls recheck access.
  const authorizer=args=>authorizeSource(args);
  authorizer.createReadScope=({principal,snapshot,signal}={})=>{
    const scope={snapshot:validateSnapshot(snapshot),originals:new Map()};
    return args=>{
      if(args?.principal!==principal||args?.signal!==signal||signal?.aborted)return Promise.resolve(false);
      return authorizeSource(args,scope);
    };
  };
  return authorizer;
}
