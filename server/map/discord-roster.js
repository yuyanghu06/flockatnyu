import {minimalMember} from './roster.js';

const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export class RosterError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new RosterError(code); };

async function boundedJson(response, signal, maxBytes = 500000) {
  if (!response.body || Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel(); fail('response_too_large');
  }
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, {once:true});
  try {
    while (true) {
      if (signal.aborted) fail('request_timeout');
      const {value,done} = await reader.read();
      if (signal.aborted) fail('request_timeout');
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) fail('response_too_large');
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('invalid_response'); }
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function request(fetchImpl, url, options) {
  const signal = AbortSignal.timeout(15000);
  try {
    const response = await fetchImpl(url, {...options, signal, redirect:'error'});
    if (!response.ok && response.status !== 429) {
      await response.body?.cancel();
      fail(response.status === 401 ? 'invalid_credentials' : response.status === 403 ? 'permission_denied' : response.status === 404 ? 'not_found' : response.status === 409 ? 'write_conflict' : 'provider_unavailable');
    }
    return {status:response.status, data:await boundedJson(response, signal)};
  } catch (error) { if (error instanceof RosterError) throw error; fail('provider_unavailable'); }
}

/** Only fixed-origin read-only Discord requests; never requests the full directory. */
export function createDiscordRosterClient({env = process.env, fetchImpl = globalThis.fetch, sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  const guildId = env.DISCORD_GUILD_ID, token = env.DISCORD_BOT_TOKEN?.trim();
  if (!snowflake(guildId) || !token) fail('discord_not_configured');
  let queries = 0;
  const get = async path => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await request(fetchImpl, `https://discord.com/api/v10/guilds/${guildId}${path}`, {method:'GET',headers:{Authorization:`Bot ${token}`}});
      if (result.status !== 429) return result.data;
      const delay = Number(result.data?.retry_after);
      if (!Number.isFinite(delay) || delay < 0 || delay > 10 || attempt === 2) fail('rate_limited');
      await sleepImpl(Math.max(10, delay * 1000));
    }
  };
  return Object.freeze({
    async verifyGuild() {
      const data = await get('');
      if (data?.id !== guildId || data?.name?.toLowerCase() !== 'tech@nyu') fail('unexpected_guild');
      return {id:guildId,name:data.name};
    },
    async searchMembers(query) {
      if (typeof query !== 'string' || !query.trim() || query.length > 100 || ++queries > 100) fail('invalid_member_query');
      const data = await get(`/members/search?${new URLSearchParams({query,limit:'100'})}`);
      if (!Array.isArray(data) || data.length > 100) fail('invalid_response');
      const members = data.map(minimalMember);
      if (members.some(member => !member)) fail('invalid_response');
      return {query,complete:data.length < 100,members};
    },
  });
}

/** Service-only adapter scoped to the configured Supabase origin and map_people. */
export function createRosterStore({env = process.env, fetchImpl = globalThis.fetch} = {}) {
  let origin;
  try {
    const url = new URL(env.SUPABASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname)) fail('supabase_not_configured');
    origin = url.origin;
  } catch { fail('supabase_not_configured'); }
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) fail('supabase_not_configured');
  const headers = {apikey:key,Authorization:`Bearer ${key}`,'content-type':'application/json'};
  async function call(params, options = {}) {
    const result = await request(fetchImpl, `${origin}/rest/v1/map_people?${params}`, {...options,method:options.method || 'GET',headers:{...headers,...options.headers}});
    if (result.status === 429) fail('rate_limited');
    if (!Array.isArray(result.data)) fail('invalid_response');
    return result.data;
  }
  return Object.freeze({
    async listPeople() {
      const rows = await call(new URLSearchParams({select:'id,display_name,first_name,last_name,discord_user_id,discord_display_name,avatar_url',order:'id',limit:'1000'}));
      if (rows.length >= 1000 || rows.some(row => !uuid(row.id) || typeof row.display_name !== 'string')) fail('incomplete_people_list');
      return rows;
    },
    async linkPerson(person, match) {
      if (!uuid(person?.id) || !snowflake(match?.discord_user_id) || typeof match.discord_display_name !== 'string' || !match.discord_display_name || match.discord_display_name.length > 100) fail('invalid_link');
      if (person.discord_user_id) return {status:person.discord_user_id === match.discord_user_id ? 'skipped' : 'conflict'};
      const params = new URLSearchParams({id:`eq.${person.id}`,discord_user_id:'is.null',select:'id'});
      for (const field of ['first_name','last_name','display_name']) params.set(field,person[field] == null ? 'is.null' : `eq.${person[field]}`);
      const patch = {discord_user_id:match.discord_user_id};
      // Compare all changed fields with their original values to preserve concurrent/manual edits.
      params.set('discord_display_name', person.discord_display_name == null ? 'is.null' : `eq.${person.discord_display_name}`);
      if (person.discord_display_name == null) patch.discord_display_name = match.discord_display_name;
      if (person.last_name == null && typeof match.last_name === 'string' && match.last_name) {
        params.set('last_name','is.null');
        params.set('first_name',person.first_name == null ? 'is.null' : `eq.${person.first_name}`);
        patch.last_name = match.last_name;
      }
      const rows = await call(params, {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});
      if (rows.length !== 1 || rows[0]?.id !== person.id) return {status:'conflict'};
      return {status:'applied'};
    },
  });
}

export async function applyMatchPlan({plan, people, store}) {
  const summary = {applied:0,skipped:0,failed:0,results:[]};
  const byId = new Map(people.map(person => [person.id,person]));
  const claimed = new Set(people.map(person => person.discord_user_id).filter(Boolean));
  const proposed = plan.filter(row => row.status === 'matched');
  const counts = new Map();
  for (const row of proposed) counts.set(row.match?.discord_user_id,(counts.get(row.match?.discord_user_id) || 0) + 1);
  for (const row of plan) {
    let status = 'skipped', reason = row.reason;
    if (row.status === 'matched') {
      const person = byId.get(row.person_id), id = row.match?.discord_user_id;
      if (person?.discord_user_id && person.discord_user_id === id) { status = 'skipped'; reason = 'existing_identity_preserved'; }
      else if (!person || claimed.has(id) || counts.get(id) !== 1) { status = 'failed'; reason = 'identity_conflict'; }
      else try {
        const result = await store.linkPerson(person,row.match);
        status = result.status === 'applied' ? 'applied' : result.status === 'skipped' ? 'skipped' : 'failed';
        reason = result.status;
        if (status === 'applied') claimed.add(id);
      } catch (error) { status = 'failed'; reason = error instanceof RosterError ? error.code : 'write_failed'; }
    }
    summary[status]++;
    summary.results.push({person_id:row.person_id,status,reason});
  }
  return summary;
}
