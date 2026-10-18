import {readdir, open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {avatarRoster,createMatchPlan,normalizeName} from '../server/map/roster.js';
import {createDiscordRosterClient,createRosterStore,applyMatchPlan,RosterError} from '../server/map/discord-roster.js';

/** Default is a read-only name-based proposal. --apply enables bounded row patches. */
export async function runRoster({env = process.env,args = [],fetchImpl = globalThis.fetch,write = console.log} = {}) {
  if (args.some(arg => arg !== '--apply' && !arg.startsWith('--output=')) || args.filter(arg => arg.startsWith('--output=')).length > 1) throw new RosterError('invalid_arguments');
  const apply = args.includes('--apply');
  const output = args.find(arg => arg.startsWith('--output='))?.slice(9);
  if (output !== undefined && (!output || !resolve(output).startsWith('/tmp/'))) throw new RosterError('output_must_be_tmp_file');
  const avatars = avatarRoster(await readdir(new URL('../assets/avatars/', import.meta.url)));
  const store = createRosterStore({env,fetchImpl}), discord = createDiscordRosterClient({env,fetchImpl});
  await discord.verifyGuild();
  const allPeople = await store.listPeople();
  const paths = new Set(avatars.map(person => person.avatar_url));
  const people = allPeople.filter(person => paths.has(person.avatar_url));
  if (people.length !== avatars.length || paths.size !== avatars.length || new Set(people.map(person => person.avatar_url)).size !== avatars.length) throw new RosterError('avatar_rows_missing_or_duplicated');
  const queries = [...new Set(people.map(person => normalizeName(person.first_name)))];
  const scans = [];
  for (const query of queries) {
    try { scans.push(await discord.searchMembers(query)); }
    catch (error) { scans.push({query,complete:false,members:[],error:error instanceof RosterError ? error.code : 'search_failed'}); }
  }
  // Other map_people rows still reserve their existing Discord IDs.
  const plan = createMatchPlan({people:allPeople,scans}).filter(row => people.some(person => person.id === row.person_id));
  const result = {mode:apply ? 'apply' : 'plan',plan};
  if (apply) result.application = await applyMatchPlan({plan,people:allPeople,store});
  if (output) {
    const file = await open(resolve(output),'wx',0o600);
    try { await file.writeFile(JSON.stringify(result,null,2)); } finally { await file.close(); }
  }
  for (const row of plan) write(`${row.display_name}: ${row.status} (${row.reason})`);
  write(JSON.stringify({mode:result.mode,total:plan.length,matched:plan.filter(row => row.status === 'matched').length,pending:plan.filter(row => row.status === 'pending').length,
    conflicts:plan.filter(row => row.status === 'conflict').length,...(result.application ? {applied:result.application.applied,failed:result.application.failed,skipped:result.application.skipped} : {})}));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRoster({args:process.argv.slice(2)}).then(result => { if (result.application?.failed) process.exitCode = 1; })
    .catch(error => { console.error(`Map roster: ${error instanceof RosterError ? error.code : 'operation_failed'}`); process.exitCode = 1; });
}
