import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareRuntimeDeployment} from '../scripts/prepare-runtime-deploy.mjs';
const execute=promisify(execFile),source=await readFile(new URL('../deployment/web/entrypoint.sh',import.meta.url),'utf8');
async function fixture({kind='file',mount='directory',override}={}) {
 const root=await mkdtemp(join(tmpdir(),'web-volume-bootstrap-')),data=join(root,'data'),bin=join(root,'bin'),log=join(root,'commands'),script=join(root,'entrypoint.sh');
 await mkdir(bin);await writeFile(log,'');
 if(mount==='directory')await mkdir(data);
 else if(mount==='symlink'){const target=join(root,'target');await mkdir(target);await symlink(target,data);}
 else if(mount==='file')await writeFile(data,'not a directory');
 const auth=join(data,'miro-auth.json');
 if(mount==='directory'){
  if(kind==='file')await writeFile(auth,'synthetic private credentials');
  if(kind==='directory')await mkdir(auth);
  if(kind==='symlink')await symlink(join(root,'absent-private-target'),auth);
 }
 await writeFile(script,source.replaceAll('/data',data));
 for(const command of ['chown','chmod','gosu'])await writeFile(join(bin,command),`#!/bin/sh\nprintf '%s' '${command}' >> "$TEST_COMMAND_LOG"\nfor arg in "$@"; do printf '|%s' "$arg" >> "$TEST_COMMAND_LOG"; done\nprintf '\\n' >> "$TEST_COMMAND_LOG"\n`,{mode:0o755});
 return {root,data,auth,log,run:()=>execute('/bin/sh',[script],{env:{PATH:bin,TEST_COMMAND_LOG:log,...(override?{MIRO_MCP_AUTH_FILE:override}:{})}}),cleanup:()=>rm(root,{recursive:true,force:true})};
}
test('web volume initialization changes only dedicated directory/exact file then execs nonroot runtime',async()=>{
 const f=await fixture();try{
  const result=await f.run();assert.equal(result.stdout,'');assert.equal(result.stderr,'');
  assert.deepEqual((await readFile(f.log,'utf8')).trim().split('\n'),[`chown|1000:1000|${f.data}`,`chmod|0700|${f.data}`,`chown|1000:1000|${f.auth}`,`chmod|0600|${f.auth}`,'gosu|node|node|server/web.js']);
  assert.equal(await readFile(f.auth,'utf8'),'synthetic private credentials');
 }finally{await f.cleanup();}
});
test('absent auth file permits startup without recursive ownership changes or credential output',async()=>{
 const f=await fixture({kind:'missing'});try{await f.run();assert.deepEqual((await readFile(f.log,'utf8')).trim().split('\n'),[`chown|1000:1000|${f.data}`,`chmod|0700|${f.data}`,'gosu|node|node|server/web.js']);}finally{await f.cleanup();}
 assert(!/chown\s+[^\n]*-[A-Za-z]*R/.test(source));assert(!source.includes('cat '));
});
test('unsafe mounts, auth symlinks/directories and arbitrary configured paths fail before ownership changes',async()=>{
 for(const options of [{mount:'symlink'},{mount:'file'},{mount:'missing'},{kind:'symlink'},{kind:'directory'},{override:'/outside/private-auth.json'}]){
  const f=await fixture(options);try{
   await assert.rejects(f.run(),error=>error.code===1&&error.stdout===''&&error.stderr.trim()==='web_volume_bootstrap_failed');
   assert.equal(await readFile(f.log,'utf8'),'');
  }finally{await f.cleanup();}
 }
});
test('sanitized web context includes reviewed bootstrap and Dockerfile installs explicit gosu',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'web-volume-context-'));try{
  const prepared=await prepareRuntimeDeployment({service:'web',temporaryRoot:directory});
  assert(prepared.files.includes('entrypoint.sh'));assert.equal(await readFile(join(prepared.directory,'entrypoint.sh'),'utf8'),source);
  const dockerfile=await readFile(join(prepared.directory,'Dockerfile'),'utf8');assert.match(dockerfile,/apt-get install -y --no-install-recommends gosu/);assert.match(dockerfile,/COPY entrypoint\.sh/);assert.match(dockerfile,/ENTRYPOINT \["\/usr\/local\/bin\/tech-nyu-web-entrypoint"\]/);
  assert((await readFile(join(prepared.directory,'.dockerignore'),'utf8')).includes('!entrypoint.sh'));
  assert.equal(JSON.parse(await readFile(join(prepared.directory,'railway.json'),'utf8')).deploy.startCommand,'/usr/local/bin/tech-nyu-web-entrypoint');
 }finally{await rm(directory,{recursive:true,force:true});}
});
