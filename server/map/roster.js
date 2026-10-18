/** Name-only identity proposals; image contents are never used for matching. */
export function normalizeName(value) {
  return typeof value === 'string' ? value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ') : '';
}

export function splitAvatarName(filename) {
  if (typeof filename !== 'string' || !/^[^/\\]+\.png$/i.test(filename)) throw new Error('invalid_avatar_filename');
  const display_name = filename.slice(0, -4).trim().replace(/\s+/g, ' ');
  if (!display_name) throw new Error('invalid_avatar_filename');
  const [first_name, ...rest] = display_name.split(' ');
  // A supplied initial remains in the display label, not in a full surname field.
  return {display_name, first_name, last_name:rest.length === 1 && normalizeName(rest[0]).length === 1 ? null : rest.join(' ') || null};
}

export function avatarRoster(filenames) {
  return filenames.filter(name => /\.png$/i.test(name)).sort().map(filename => ({...splitAvatarName(filename), avatar_url:`/assets/avatars/${encodeURIComponent(filename)}`}));
}

const surnameHint = person => normalizeName(person.last_name || (person.display_name?.split(/\s+/).length === 2 ? person.display_name.split(/\s+/)[1] : ''));

export function minimalMember(member) {
  const user = member?.user || member;
  if (!user || typeof user.id !== 'string' || !/^[0-9]{1,20}$/.test(user.id)) return null;
  const text = value => typeof value === 'string' ? value.slice(0, 100) : null;
  return {id:user.id, nick:text(member.nick), global_name:text(user.global_name), username:text(user.username), bot:user.bot === true};
}

function candidateFor(person, member) {
  const first = normalizeName(person.first_name || person.display_name?.split(' ')[0]);
  const last = surnameHint(person);
  const names = [member.nick, member.global_name, member.username].filter(Boolean).map(normalizeName);
  const exactFirst = names.some(name => name.split(' ')[0] === first);
  const username = normalizeName(member.username);
  // Every prefix account remains an ambiguity blocker, including short surnames
  // such as Li/Hu/Ng. A prefix never supplies sufficient identity evidence.
  const prefix = !exactFirst && username.startsWith(first);
  if (!first || !exactFirst && !prefix) return null;
  const full = last && names.some(name => name === `${first} ${last}`);
  const initial = last.length === 1 && names.some(name => {
    const tokens = name.split(' '); return tokens[0] === first && tokens.length > 1 && tokens.at(-1).startsWith(last);
  });
  return {id:member.id, display_name:member.nick || member.global_name || member.username || member.id,
    method:full ? 'exact_full_name' : initial ? 'exact_last_initial' : exactFirst ? 'exact_first_token' : 'username_prefix', member};
}

/** A search is complete only below Discord's 100-result ceiling without errors. */
export function createMatchPlan({people, scans}) {
  if (!Array.isArray(people) || !Array.isArray(scans)) throw new Error('invalid_match_input');
  const members = new Map();
  for (const scan of scans) for (const raw of scan.members || []) {
    const member = minimalMember(raw);
    if (member && !member.bot) members.set(member.id, member);
  }
  const occupied = new Map(people.filter(person => person.discord_user_id).map(person => [person.discord_user_id, person.id]));
  const plan = people.map(person => {
    const row = {person_id:person.id, display_name:person.display_name, status:'pending', reason:'no_name_match', candidates:[]};
    if (person.discord_user_id) return {...row,status:'already_linked',reason:'existing_identity_preserved'};
    const first = normalizeName(person.first_name || person.display_name?.split(' ')[0]);
    const searched = scans.filter(scan => normalizeName(scan.query) === first);
    const complete = searched.length > 0 && searched.every(scan => scan.complete === true && !scan.error && Array.isArray(scan.members) && scan.members.length < 100);
    const candidates = [...members.values()].map(member => candidateFor(person, member)).filter(Boolean);
    row.candidates = candidates.map(({member, ...candidate}) => candidate);
    if (!complete) return {...row,reason:'incomplete_member_search'};
    const last = surnameHint(person);
    if (last.length === 1) return {...row,reason:'initial_requires_confirmation'};
    const full = candidates.filter(candidate => candidate.method === 'exact_full_name');
    const eligible = full.length ? full : last.length === 1 ? candidates.filter(candidate => candidate.method === 'exact_last_initial')
      : last ? [] : candidates.filter(candidate => candidate.method !== 'username_prefix');
    if (eligible.length !== 1 || !last && candidates.length !== 1) return {...row,reason:candidates.length > 1 ? 'ambiguous_name' : candidates.length ? 'insufficient_name_evidence' : 'no_name_match'};
    const selected = eligible[0];
    if (occupied.has(selected.id)) return {...row,status:'conflict',reason:'discord_identity_already_used'};
    const match = {discord_user_id:selected.id, discord_display_name:selected.display_name};
    const nickname = selected.member.nick?.trim().split(/\s+/);
    if (person.last_name == null && nickname?.length === 2 && normalizeName(nickname[0]) === first && /^[\p{L}\p{M}'’-]{2,}$/u.test(nickname[1])) match.last_name = nickname[1];
    return {...row,status:'matched',reason:selected.method,match};
  });
  const claims = new Map();
  for (const row of plan) if (row.match) claims.set(row.match.discord_user_id, (claims.get(row.match.discord_user_id) || 0) + 1);
  return plan.map(row => {
    if (!row.match || claims.get(row.match.discord_user_id) === 1) return row;
    const {match, ...rest} = row; return {...rest,status:'conflict',reason:'duplicate_roster_claim'};
  });
}
