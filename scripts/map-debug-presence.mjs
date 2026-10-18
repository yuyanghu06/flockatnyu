// Explicit, expiring UI fixture. Never a real self-report or location observation.
const sourceId = 'a7969a7a-53cc-4c75-9736-95dd386f1c5e';
const sourceUrl = 'https://example.invalid/tech-nyu/map-debug/bobst-fixture-v1';
const buildingId = 'bobst-library';
const labels = ['Arda', 'Bianca', 'Charice', 'Enoch', 'Yuyang'];
const args = process.argv.slice(2);
if (args.length !== 1 || !['--apply', '--clear'].includes(args[0])) {
  console.error('Usage: node --env-file-if-exists=.env scripts/map-debug-presence.mjs --apply|--clear');
  process.exit(1);
}
const origin = new URL(process.env.SUPABASE_URL || 'https://not-configured.invalid').origin;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (origin !== 'https://jssehnrmqhstcrtxulpa.supabase.co' || !key) throw Error('Expected configured Tech NYU Supabase project');
const headers = {apikey:key,Authorization:`Bearer ${key}`,'content-type':'application/json'};
async function call(path, options = {}) {
  const response = await fetch(`${origin}/rest/v1/${path}`, {...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error(`Map fixture request failed (HTTP ${response.status})`);
  return response.json();
}
const isDebug = entry => entry.source_id === sourceId && entry.source_url === sourceUrl;
const [people, buildings] = await Promise.all([
  call('map_people?select=id,display_name,is_trackable&limit=1000'),
  call('map_buildings?select=id,people_here,updated_at&limit=1000'),
]);
const bobst = buildings.find(b => b.id === buildingId);
if (!bobst) throw Error('Bobst building not found');
if (args[0] === '--clear') {
  // Compare the complete old array and timestamp: never overwrite a concurrent edit.
  const params = new URLSearchParams({id:`eq.${buildingId}`,updated_at:`eq.${bobst.updated_at}`,people_here:`eq.${JSON.stringify(bobst.people_here)}`,select:'id,people_here'});
  const cleaned = bobst.people_here.filter(entry => !isDebug(entry));
  const rows = await call(`map_buildings?${params}`, {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({people_here:cleaned})});
  if (rows.length !== 1) throw Error('Concurrent map edit; rerun clear');
  if (rows[0].people_here.some(isDebug)) throw Error('Fixture cleanup verification failed');
  console.log(JSON.stringify({buildingId,cleared:bobst.people_here.length-cleaned.length}));
} else {
  const selected = labels.map(label => {
    const found = people.filter(p => p.display_name === label && p.is_trackable);
    if (found.length !== 1) throw Error('Expected one trackable fixture person for each selected avatar');
    return found[0];
  });
  if (bobst.people_here.some(e => selected.some(p => p.id === e.person_id) && !isDebug(e))) throw Error('Fixture would replace a non-debug entry; refusing');
  const validFrom = new Date().toISOString();
  const expiresAt = new Date(Date.now()+24*60*60*1000).toISOString();
  const entries = selected.map(person => ({person_id:person.id,status:'planned',label:'Test',valid_from:validFrom,expires_at:expiresAt,source_id:sourceId,source_url:sourceUrl}));
  const params = new URLSearchParams({id:`eq.${buildingId}`,updated_at:`eq.${bobst.updated_at}`,people_here:`eq.${JSON.stringify(bobst.people_here)}`,select:'id'});
  const next = bobst.people_here.filter(e => !selected.some(p => p.id === e.person_id)).concat(entries);
  const rows = await call(`map_buildings?${params}`, {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({people_here:next})});
  if (rows.length !== 1) throw Error('Concurrent map edit; rerun apply');
  const fresh = await call('rpc/map_get_buildings', {method:'POST',body:'{}'});
  const actual = fresh.find(b => b.id === buildingId)?.people_here.filter(isDebug) || [];
  if (actual.length !== 5 || !selected.every(p => actual.some(e => e.person_id === p.id && e.status === 'planned' && e.label === 'Test' && e.expires_at === expiresAt))) throw Error('Fixture verification failed');
  for (const old of buildings.filter(b => b.id !== buildingId)) {
    const current = fresh.find(b => b.id === old.id);
    const activeBefore = old.people_here.filter(e => Date.parse(e.valid_from) <= Date.now() && Date.parse(e.expires_at) > Date.now());
    if (JSON.stringify(current.people_here) !== JSON.stringify(activeBefore)) throw Error('Other building data changed; inspect concurrent writes');
  }
  console.log(JSON.stringify({buildingId,debugPeople:labels,status:'planned',expiresAt,verified:true}));
}
