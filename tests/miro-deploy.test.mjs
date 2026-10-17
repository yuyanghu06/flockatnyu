import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareMiroDeployment} from '../scripts/prepare-miro-deploy.mjs';
test('isolated deployment builds a fresh context and excludes credentials, unrelated code and symlinks',async()=>{
 const root=await mkdtemp(join(tmpdir(),'miro-fixture-'));const outputs=[];
 try{
  await mkdir(join(root,'server/miro'),{recursive:true});await mkdir(join(root,'deployment/miro-worker'),{recursive:true});
  await writeFile(join(root,'server/miro/cli.js'),'export {};');await writeFile(join(root,'server/miro/info.md'),'Guide');await writeFile(join(root,'deployment/miro-worker/Dockerfile'),'FROM node:22-slim');await writeFile(join(root,'.env'),'SECRET_SENTINEL');await writeFile(join(root,'server/unrelated.js'),'UNRELATED_SENTINEL');
  const a=await prepareMiroDeployment({root});outputs.push(a.directory);assert.deepEqual(a.files.sort(),['Dockerfile','package.json','server/miro/cli.js']);
  assert.deepEqual((await readdir(a.directory)).sort(),['Dockerfile','package.json','server']);JSON.parse(await readFile(join(a.directory,'package.json'),'utf8'));
  const b=await prepareMiroDeployment({root});outputs.push(b.directory);assert.notEqual(a.directory,b.directory);
  await symlink(join(root,'.env'),join(root,'server/miro/leak.js'));await assert.rejects(prepareMiroDeployment({root}),/deployment_symlink_denied/);
 }finally{await Promise.all([root,...outputs].map(p=>rm(p,{recursive:true,force:true})));}
});
