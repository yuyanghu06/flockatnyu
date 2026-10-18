// Service-only map reads. Provenance is checked here; SQL freshness alone is not authorization.
export const MAP_DEBUG_SOURCE_ID = 'a7969a7a-53cc-4c75-9736-95dd386f1c5e';
export const MAP_DEBUG_SOURCE_URL = 'https://example.invalid/tech-nyu/map-debug/bobst-fixture-v1';
export const MAP_DEBUG_EVENTS_SOURCE_ID = '742d78b8-6d13-4f4a-a692-342617080bae';
export const MAP_DEBUG_EVENTS_SOURCE_URL = 'https://example.invalid/tech-nyu/map-debug/bobst-events-v1';
// Explicitly user-requested local map plans; not a general source-policy bypass.
export const MAP_LOCAL_PLAN_SOURCE_ID = '34ee17b6-8e0a-48c7-9ad9-c1d9b3f26ca5';
export const MAP_LOCAL_PLAN_SOURCE_URL = 'https://example.invalid/tech-nyu/map-local-plans/yuyang-v1';
export const MAP_LOCAL_PLAN_PERSON_ID = '135da55d-f0e8-5fec-50e9-c860f26e6782';
const localPlanBuildings = new Set(['stern-school-of-business','courant-institute','nyu-john-a-paulson-center']);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const boundedText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const displayLabel = value => typeof value === 'string' && [...value].length <= 200;
const buildingId = value => boundedText(value, 120) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
const timeoutValue = value => Number.isFinite(value) ? Math.min(15000, Math.max(50, value)) : 5000;
const unavailable = () => ({status:'unavailable', buildings:[]});

async function boundedWork(work, signal, timeoutMs) {
  if (signal?.aborted) throw new Error('map_read_cancelled');
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timer, onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(new Error('map_read_cancelled'));
    controller.signal.addEventListener('abort', onAbort, {once:true});
  });
  signal?.addEventListener('abort', abort, {once:true});
  timer = setTimeout(abort, timeoutValue(timeoutMs));
  try {
    if (signal?.aborted) abort();
    // Attach the rejection handler before starting adapters, including adapters
    // that synchronously abort or throw. Pre-cancelled requests never run work.
    const pending = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error('map_read_cancelled');
      return work(controller.signal);
    });
    return await Promise.race([pending, cancelled]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', onAbort);
    controller.abort();
  }
}

async function boundedJson(response, signal) {
  const maxBytes = 1000000;
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error('map_read_failed');
  }
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, {once:true});
  try {
    while (true) {
      if (signal.aborted) throw new Error('map_read_cancelled');
      const {value, done} = await reader.read();
      if (signal.aborted) throw new Error('map_read_cancelled');
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error('map_read_too_large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Fixed configured Supabase origin, two read-only operations, no browser credentials. */
export function createMapPresenceStore({env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 5000} = {}) {
  let origin = null;
  try {
    const url = new URL(env.SUPABASE_URL);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && ['', '/'].includes(url.pathname)) origin = url.origin;
  } catch {}
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const configured = Boolean(origin && key);
  return Object.freeze({configured,
    async read({observedAt, signal} = {}) {
      if (!configured) throw new Error('map_not_configured');
      if (!Number.isFinite(Date.parse(observedAt))) throw new Error('invalid_observation_time');
      return boundedWork(async requestSignal => {
        const headers = {apikey:key, Authorization:`Bearer ${key}`, 'content-type':'application/json'};
        const request = async (path, options = {}) => boundedJson(await fetchImpl(`${origin}/rest/v1/${path}`, {
          ...options, headers, redirect:'error', signal:requestSignal,
        }), requestSignal);
        const params = new URLSearchParams({select:'id,display_name,avatar_url,is_trackable', is_trackable:'eq.true', order:'id', limit:'1000'});
        const [buildings, people] = await Promise.all([
          request(`map_buildings?${new URLSearchParams({select:'id,name,people_here,scheduled_events',order:'id',limit:'101'})}`, {method:'GET'}),
          request(`map_people?${params}`, {method:'GET'}),
        ]);
        if (!Array.isArray(buildings) || buildings.length > 100 || !Array.isArray(people) || people.length >= 1000) throw new Error('invalid_map_response');
        return {buildings, people};
      }, signal, timeoutMs);
    },
  });
}

function safeAvatar(value) {
  // Only the project's own portrait files are exposed; unexpected URLs use initials.
  if (typeof value !== 'string' || value.length > 2048 || !/^\/assets\/avatars\/[^/?#\\\s]+\.png$/.test(value)) return null;
  try {
    const file = decodeURIComponent(value.slice('/assets/avatars/'.length));
    if (!file || /[\/\\\x00-\x1f\x7f]/.test(file) || file === '..') return null;
    return value;
  } catch { return null; }
}

function safeHttps(value) {
  if (!boundedText(value, 2048)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function safeEvent(event, at) {
  if (!event || typeof event !== 'object' || Array.isArray(event) ||
      !boundedText(event.id, 200) || !boundedText(event.title?.trim(), 200) ||
      !['confirmed','tentative'].includes(event.status) || typeof event.all_day !== 'boolean' ||
      !uuid(event.source_id) || !safeHttps(event.source_url) || !boundedText(event.time_zone, 100)) return null;
  const starts = Date.parse(event.starts_at), ends = Date.parse(event.ends_at);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts || ends <= at) return null;
  try { new Intl.DateTimeFormat('en-US', {timeZone:event.time_zone}); } catch { return null; }
  for (const [key, max] of [['description',4000],['location',500],['url',2048]]) {
    if (event[key] !== undefined && (typeof event[key] !== 'string' || event[key].length > max)) return null;
  }
  if (event.url && !safeHttps(event.url)) return null;
  if (event.attendee_ids !== undefined && (!Array.isArray(event.attendee_ids) || event.attendee_ids.length > 500 ||
      !event.attendee_ids.every(uuid) || new Set(event.attendee_ids.map(id=>id.toLowerCase())).size !== event.attendee_ids.length)) return null;
  return {id:event.id, title:event.title, startsAt:new Date(starts).toISOString(), endsAt:new Date(ends).toISOString(),
    timeZone:event.time_zone, allDay:event.all_day, status:event.status,
    description:event.description ?? '', location:event.location ?? '', url:event.url ? safeHttps(event.url) : null};
}

/** authorizeSource must recheck current source policy; an allowlisted UUID alone grants nothing. */
export function createMapPresenceService({store = createMapPresenceStore(), production = process.env.NODE_ENV === 'production', authorizeSource = null, now = () => new Date(), timeoutMs = 5000} = {}) {
  return Object.freeze({configured:store?.configured === true,
    async read({principal, signal} = {}) {
      if (!boundedText(principal?.id, 200) || !Array.isArray(principal.allowedSourceIds)) return {status:'forbidden', buildings:[]};
      if (store?.configured !== true) return {status:'not_configured', buildings:[]};
      try {
        return await boundedWork(async readSignal => {
          const date = new Date(now());
          if (!Number.isFinite(date.getTime())) throw new Error('invalid_observation_time');
          const observedAt = date.toISOString(), at = date.getTime();
          const data = await store.read({observedAt, signal:readSignal});
          if (!Array.isArray(data?.buildings) || data.buildings.length > 100 || !Array.isArray(data.people) || data.people.length >= 1000) throw new Error('invalid_map_response');
          const people = new Map();
          for (const person of data.people) {
            if (!uuid(person?.id) || !boundedText(person.display_name, 200) || person.is_trackable !== true) continue;
            if (people.has(person.id)) throw new Error('duplicate_map_person');
            people.set(person.id, person);
          }
          const buildings = [], upcoming = [], seenBuildings = new Set();
          for (const building of data.buildings) {
            if (!buildingId(building?.id) || !boundedText(building.name, 200) || !Array.isArray(building.people_here) || building.people_here.length > 500 || seenBuildings.has(building.id)) throw new Error('invalid_map_building');
            seenBuildings.add(building.id);
            const visible = [], seenPeople = new Set();
            for (const entry of building.people_here) {
              const person = people.get(entry?.person_id);
              if (!person || seenPeople.has(person.id) || !['planned','self_reported'].includes(entry.status) || !uuid(entry.source_id) || !boundedText(entry.source_url, 2048) || !displayLabel(entry.label)) continue;
              const from = Date.parse(entry.valid_from), until = Date.parse(entry.expires_at);
              if (!Number.isFinite(from) || !Number.isFinite(until) || until <= at || until <= from) continue;
              const isUpcoming = from > at;
              if (isUpcoming && entry.status !== 'planned') continue;
              const isLocalFixture = entry.source_id === MAP_DEBUG_SOURCE_ID || entry.source_url === MAP_DEBUG_SOURCE_URL;
              const isLocalPlan = entry.source_id === MAP_LOCAL_PLAN_SOURCE_ID || entry.source_url === MAP_LOCAL_PLAN_SOURCE_URL;
              if (isLocalPlan) {
                if (production || principal.id !== 'local-development' || person.id !== MAP_LOCAL_PLAN_PERSON_ID || !localPlanBuildings.has(building.id) || entry.status !== 'planned' || entry.source_id !== MAP_LOCAL_PLAN_SOURCE_ID || entry.source_url !== MAP_LOCAL_PLAN_SOURCE_URL) continue;
              } else if (isLocalFixture) {
                if (production || principal.id !== 'local-development' || building.id !== 'bobst-library' || entry.status !== 'planned' || entry.source_id !== MAP_DEBUG_SOURCE_ID || entry.source_url !== MAP_DEBUG_SOURCE_URL) continue;
              } else {
                if (!principal.allowedSourceIds.includes(entry.source_id) || typeof authorizeSource !== 'function') continue;
                const allowed = await authorizeSource({principal, sourceId:entry.source_id, sourceUrl:entry.source_url, buildingId:building.id, signal:readSignal});
                if (allowed !== true) continue;
              }
              seenPeople.add(person.id);
              if (isUpcoming) {
                upcoming.push({personId:person.id, buildingId:building.id, buildingName:building.name, label:entry.label,
                  validFrom:new Date(from).toISOString(), expiresAt:new Date(until).toISOString()});
                continue;
              }
              visible.push({id:person.id, displayName:person.display_name, avatarUrl:safeAvatar(person.avatar_url), status:entry.status, label:entry.label,
                validFrom:new Date(from).toISOString(), expiresAt:new Date(until).toISOString()});
            }
            const events = [], seenEvents = new Set();
            if (building.scheduled_events !== undefined && (!Array.isArray(building.scheduled_events) || building.scheduled_events.length > 200)) throw new Error('invalid_building_events');
            for (const event of building.scheduled_events ?? []) {
              const presentation = safeEvent(event, at);
              if (!presentation || seenEvents.has(event.id)) continue;
              seenEvents.add(event.id);
              // Explicit Bobst event fixtures are visible only in local development.
              // Person fixtures and ordinary source events retain independent checks.
              const isEventFixture = event.source_id === MAP_DEBUG_EVENTS_SOURCE_ID || event.source_url === MAP_DEBUG_EVENTS_SOURCE_URL;
              if (isEventFixture) {
                if (production || principal.id !== 'local-development' || building.id !== 'bobst-library' ||
                    event.source_id !== MAP_DEBUG_EVENTS_SOURCE_ID || event.source_url !== MAP_DEBUG_EVENTS_SOURCE_URL ||
                    !event.id.startsWith('bobst-ui-debug-v1-') || !event.title.startsWith('[UI TEST] ')) continue;
              } else {
                if (!principal.allowedSourceIds.includes(event.source_id) || typeof authorizeSource !== 'function') continue;
                if (await authorizeSource({principal, sourceId:event.source_id, sourceUrl:event.source_url, buildingId:building.id, signal:readSignal}) !== true) continue;
              }
              if (event.attendee_ids !== undefined) presentation.attendees = event.attendee_ids
                .map(id=>people.get(id.toLowerCase())).filter(Boolean)
                .map(person=>({id:person.id,displayName:person.display_name,avatarUrl:safeAvatar(person.avatar_url)}));
              events.push(presentation);
            }
            events.sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
            buildings.push({id:building.id, name:building.name, people:visible, events});
          }
          upcoming.sort((a,b)=>Date.parse(a.validFrom)-Date.parse(b.validFrom));
          return {status:'ok', observedAt, buildings, upcoming};
        }, signal, timeoutMs);
      } catch { return unavailable(); }
    },
  });
}
