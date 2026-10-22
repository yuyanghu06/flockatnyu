import {createHash} from 'node:crypto';
import {lstat, mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const PROJECT='jssehnrmqhstcrtxulpa',BUCKET='map-avatars',MAX=4194304;
const uuid=value=>typeof value==='string'&&value.length===36&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw new Error(code);};
const legacyFile=value=>{
  if(typeof value!=='string'||!/^\/assets\/avatars\/[^/?#\\\s]+\.png$/.test(value))return null;
  try{const name=decodeURIComponent(value.slice(16));return name&&!/[\/\\\x00-\x1f\x7f]/.test(name)&&name.endsWith('.png')?name:null;}catch{return null;}
};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const preserved=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['avatar_url','updated_at'].includes(key)));

async function body(response,max=MAX){
  if(!response.body||Number(response.headers.get('content-length'))>max){await response.body?.cancel();fail('oversize_response');}
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>max)fail('oversize_response');chunks.push(part.value);}return Buffer.concat(chunks);}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
function png(bytes){
  return bytes.length>=33&&bytes.length<=MAX&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    &&bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR'
    &&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(16)<=4096&&bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(20)<=4096;
}
async function deniedPrivateRead(response){
  if([401,403,404].includes(response.status)){await response.body?.cancel();return true;}
  if(response.status!==400){await response.body?.cancel();return false;}
  // Storage uses HTTP400 for its documented private-bucket/missing-auth
  // envelopes. An unrelated bad request or provider outage proves no privacy.
  try{
    const value=JSON.parse((await body(response,2048)).toString('utf8'));
    return value.code==='NoSuchBucket'&&String(value.statusCode)==='404'
      ||value.code==='InvalidRequest'&&String(value.statusCode)==='400'&&value.message==="headers must have required property 'authorization'";
  }catch{return false;}
}

/** Operator-only migration. Upload/verify never change profiles. Apply requires
 * a separate explicit deployment-readiness assertion and optimistic row guards.
 * The manifest is private operational evidence, never an application asset. */
export async function migrateAvatarStorage({env=process.env,mode='plan',manifestPath,
  root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),fetchImpl=fetch,personId,webReady=false}={}){
  if(!['plan','upload','apply','verify'].includes(mode)||personId&&!uuid(personId))fail('invalid_arguments');
  const origin=`https://${PROJECT}.supabase.co`;
  if(env.SUPABASE_URL?.replace(/\/$/,'')!==origin||!env.SUPABASE_SERVICE_ROLE_KEY)fail('unexpected_or_unconfigured_project');
  if(mode==='apply'&&!webReady)fail('deploy_compatible_web_before_profile_updates');
  if(mode!=='plan'&&!manifestPath)fail('private_manifest_required');
  if(manifestPath){
    manifestPath=resolve(manifestPath);
    if(!manifestPath.startsWith(resolve(root,'evidence/storage-avatars')+'/'))fail('manifest_must_be_ignored_evidence');
    try{if((await lstat(manifestPath)).isSymbolicLink())fail('manifest_symlink_denied');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`};
  const request=async(path,options={})=>fetchImpl(origin+path,{...options,redirect:'error',signal:AbortSignal.timeout(30000),headers:{...headers,...options.headers}});
  const json=async(path,options={})=>{const r=await request(path,options);if(!r.ok){await r.body?.cancel();fail(`provider_http_${r.status}`);}try{return JSON.parse((await body(r,1048576)).toString('utf8'));}catch(e){if(/^provider_|oversize/.test(e.message))throw e;fail('invalid_provider_json');}};
  const listPeople=async()=>{const rows=await json('/rest/v1/map_people?select=*&order=id&limit=1000');if(!Array.isArray(rows)||rows.length>=1000||rows.some(p=>!uuid(p.id)))fail('incomplete_profile_snapshot');return rows;};
  let manifest;
  if(manifestPath){try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}
  const save=async()=>{if(!manifestPath)return;await mkdir(dirname(manifestPath),{recursive:true});const temp=manifestPath+'.tmp';await writeFile(temp,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});await rename(temp,manifestPath);};
  if(!manifest){
    if(['apply','verify'].includes(mode))fail('upload_manifest_required');
    const profiles=await listPeople(),rows=[];
    for(const before of profiles){
      const filename=legacyFile(before.avatar_url);if(!filename)continue;
      const path=resolve(root,'assets/avatars',filename),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX)fail('invalid_local_avatar');
      const bytes=await readFile(path);if(!png(bytes))fail('invalid_local_png');const sha256=hash(bytes),objectKey=`${before.id}/${sha256}.png`;
      rows.push({id:before.id,before,filename,sha256,bytes:bytes.length,objectKey,storageUrl:`${origin}/storage/v1/object/authenticated/${BUCKET}/${objectKey}`,verified:false,after:null});
    }
    if(!rows.length)fail('no_unmigrated_local_profiles');
    manifest={version:1,origin,bucket:BUCKET,createdAt:new Date().toISOString(),profilesBefore:profiles,rows};
    if(mode==='upload')await save();
  }
  if(manifest.version!==1||manifest.origin!==origin||manifest.bucket!==BUCKET||!Array.isArray(manifest.rows)||!Array.isArray(manifest.profilesBefore))fail('invalid_manifest');
  for(const row of manifest.rows){
    if(!uuid(row.id)||row.before?.id!==row.id||legacyFile(row.before.avatar_url)!==row.filename||typeof row.sha256!=='string'||row.sha256.length!==64||!/^[0-9a-f]{64}$/.test(row.sha256)
      ||row.objectKey!==`${row.id}/${row.sha256}.png`||row.storageUrl!==`${origin}/storage/v1/object/authenticated/${BUCKET}/${row.objectKey}`)fail('invalid_manifest_row');
  }
  const selected=manifest.rows.filter(row=>!personId||row.id===personId);if(!selected.length)fail('profile_not_in_manifest');
  if(mode==='plan')return {mode,profiles:manifest.rows.length,totalBytes:manifest.rows.reduce((n,row)=>n+row.bytes,0),profileWrites:0};
  let bucket=(await json('/storage/v1/bucket')).find(row=>row.id===BUCKET);
  if(!bucket&&mode==='upload'){
    await json('/storage/v1/bucket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:BUCKET,name:BUCKET,public:false,file_size_limit:MAX,allowed_mime_types:['image/png']})});
    bucket=await json(`/storage/v1/bucket/${BUCKET}`);
  }
  if(!bucket||bucket.public!==false||Number(bucket.file_size_limit)!==MAX||!equal(bucket.allowed_mime_types,['image/png']))fail('unexpected_bucket_policy');
  for(const row of selected){
    if(mode==='upload'){
      const bytes=await readFile(resolve(root,'assets/avatars',row.filename));if(hash(bytes)!==row.sha256||!png(bytes))fail('local_avatar_changed');
      const result=await request(`/storage/v1/object/${BUCKET}/${row.objectKey}`,{method:'POST',headers:{'content-type':'image/png','cache-control':'max-age=31536000','x-upsert':'false'},body:bytes});
      if(!result.ok&&![400,409].includes(result.status)){await result.body?.cancel();fail(`upload_http_${result.status}`);}await result.body?.cancel();
    }
    const object=await request(`/storage/v1/object/authenticated/${BUCKET}/${row.objectKey}`);
    if(!object.ok){await object.body?.cancel();fail(`object_http_${object.status}`);}const bytes=await body(object);
    if(!png(bytes)||hash(bytes)!==row.sha256)fail('stored_object_hash_mismatch');
    const anonymous=await fetchImpl(row.storageUrl,{redirect:'error',signal:AbortSignal.timeout(15000)});const publicPath=await fetchImpl(row.storageUrl.replace('/object/authenticated/','/object/public/'),{redirect:'error',signal:AbortSignal.timeout(15000)});
    const privateOnly=await deniedPrivateRead(anonymous)&&await deniedPrivateRead(publicPath);
    row.anonymousReadStatus=anonymous.status;row.publicReadStatus=publicPath.status;
    await anonymous.body?.cancel().catch(()=>{});await publicPath.body?.cancel().catch(()=>{});if(!privateOnly)fail('object_privacy_not_verified');
    row.verified=true;await save();
    if(mode==='apply'){
      const current=(await json(`/rest/v1/map_people?${new URLSearchParams({select:'*',id:`eq.${row.id}`})}`))[0];
      if(!current||!equal(preserved(current),preserved(row.before)))fail('profile_identity_changed');
      if(current.avatar_url===row.storageUrl){row.after=current;await save();continue;}
      if(current.avatar_url!==row.before.avatar_url||current.updated_at!==row.before.updated_at)fail('profile_write_conflict');
      const params=new URLSearchParams({select:'*',id:`eq.${row.id}`,avatar_url:`eq.${row.before.avatar_url}`,updated_at:`eq.${row.before.updated_at}`});
      const changed=await json(`/rest/v1/map_people?${params}`,{method:'PATCH',headers:{'content-type':'application/json',Prefer:'return=representation'},body:JSON.stringify({avatar_url:row.storageUrl})});
      if(changed.length!==1||changed[0].avatar_url!==row.storageUrl||!equal(preserved(changed[0]),preserved(row.before)))fail('profile_write_conflict');
      row.after=changed[0];await save();
    }
  }
  const after=await listPeople(),byId=new Map(after.map(row=>[row.id,row]));
  for(const before of manifest.profilesBefore){const current=byId.get(before.id);if(!current||!equal(preserved(current),preserved(before)))fail('profile_preservation_failed');}
  manifest.lastVerification={at:new Date().toISOString(),profiles:after.length,verifiedObjects:manifest.rows.filter(row=>row.verified).length,migratedProfiles:manifest.rows.filter(row=>byId.get(row.id)?.avatar_url===row.storageUrl).length,allPriorProfileFactsPreserved:true};await save();
  return {mode,selected:selected.length,...manifest.lastVerification};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),modes=args.filter(a=>['--upload','--apply','--verify'].includes(a));
  if(modes.length>1||args.some(a=>!['--upload','--apply','--verify','--web-ready'].includes(a)&&!a.startsWith('--manifest=')&&!a.startsWith('--person=')))fail('invalid_arguments');
  migrateAvatarStorage({mode:modes[0]?.slice(2)||'plan',manifestPath:args.find(a=>a.startsWith('--manifest='))?.slice(11),personId:args.find(a=>a.startsWith('--person='))?.slice(9),webReady:args.includes('--web-ready')})
    .then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(JSON.stringify({status:'failed',code:/^[a-z0-9_]+$/.test(error.message)?error.message:'migration_failed'}));process.exitCode=1;});
}
