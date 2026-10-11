import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { createKimmelModel, removeKimmelGeometry } from '../src/kimmel.js';
import { createGlobalCenterModel, removeGlobalCenterGeometry, globalCenterReplacement } from '../src/global-center.js';

// Filesystem-only acceptance: never opens a browser or contacts a server.
const file='yuyang-site-3d-assets/models/buildings/city-tiles/tile--1_0.glb';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const initialHash=digest(fs.readFileSync(file));
await MeshoptDecoder.ready;
async function load(){const b=fs.readFileSync(file);return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;}
function meshes(root){const out=[];root.traverse(o=>{if(o.isMesh)out.push(o);});return out;}
function arrayHash(a){return digest(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
function attributes(root){return meshes(root).map(m=>({matrix:m.matrix.toArray(),material:m.material.uuid,attributes:Object.fromEntries(Object.entries(m.geometry.attributes).map(([key,a])=>[key,{itemSize:a.itemSize,normalized:a.normalized,count:a.count,hash:arrayHash(a.isInterleavedBufferAttribute?a.data.array:a.array)}]))}));}
function indices(root){return meshes(root).map(m=>Array.from(m.geometry.index?.array??Array.from({length:m.geometry.attributes.position.count},(_,i)=>i)));}
function count(root){return indices(root).reduce((n,a)=>n+a.length/3,0);}
function modelSignature(root){return meshes(root).map(m=>({name:m.name,matrix:m.matrix.toArray(),color:m.material.color.toArray(),attrs:Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,a])=>[k,arrayHash(a.array)])),index:m.geometry.index?arrayHash(m.geometry.index.array):null}));}
function triangles(indices){return indices.map(a=>{const out=[];for(let i=0;i<a.length;i+=3)out.push(a.slice(i,i+3).join(','));return out;});}
function subtraction(before,after){return before.map((list,i)=>{const keep=new Map();after[i].forEach(t=>keep.set(t,(keep.get(t)??0)+1));const removed=[];for(const t of list){if(keep.get(t)>0)keep.set(t,keep.get(t)-1);else removed.push(t);}assert([...keep.values()].every(n=>n===0),'No new or reordered-vertex triangles');return removed;});}
const results={source:file,sourceSha256:initialHash,checks:[],browser:'UNAVAILABLE: localhost access denied; no browser or alternative access attempted.'};
function check(name,fn){fn();results.checks.push({name,pass:true});}
const original=await load(), attr=attributes(original), originalIndices=indices(original), originalTriangles=triangles(originalIndices);
check('Original tile has 2598 triangles',()=>assert.equal(count(original),2598));
const kimmelBefore=modelSignature(createKimmelModel(original));
const globalBefore=modelSignature(createGlobalCenterModel(original));
check('Both builders preserve every source attribute and index',()=>{assert.deepEqual(attributes(original),attr);assert.deepEqual(indices(original),originalIndices);});
const k=removeKimmelGeometry(original), afterK=triangles(indices(original));
check('Kimmel removes exactly 200',()=>assert.equal(k,200));
const model=createGlobalCenterModel(original);
check('GCASL model is identical before and after Kimmel removal',()=>assert.deepEqual(modelSignature(model),globalBefore));
const g=removeGlobalCenterGeometry(original), finalIndices=indices(original), finalTriangles=triangles(finalIndices);
check('GCASL removes 88 after Kimmel; combined remainder 2310',()=>{assert.equal(g,88);assert.equal(count(original),2310);assert.equal(model.userData.architecture.sourceTriangles,88);});
const reverse=await load();assert.equal(removeGlobalCenterGeometry(reverse),88);
check('Kimmel geometry is identical after GCASL removal',()=>assert.deepEqual(modelSignature(createKimmelModel(reverse)),kimmelBefore));
assert.equal(removeKimmelGeometry(reverse),200);
check('Removal order commutes exactly and all retained attributes remain unchanged',()=>{assert.deepEqual(indices(reverse),finalIndices);assert.deepEqual(attributes(original),attr);});
const removedK=subtraction(originalTriangles,afterK), removedG=subtraction(afterK,finalTriangles);
check('Removal sets are disjoint and final triangles are exact original tuples',()=>{subtraction(originalTriangles,finalTriangles);removedK.forEach((list,i)=>assert(list.every(t=>!removedG[i].includes(t))));});
const modelMeshes=meshes(model), bounds=new THREE.Box3().setFromObject(model);
check('Identity world-space model, finite positions, bounded footprint and grounded foundation',()=>{
  assert.deepEqual(model.matrix.toArray(),new THREE.Matrix4().toArray());
  assert.equal(model.userData.buildingId,'nyu-global-center');
  for(const mesh of modelMeshes){assert.equal(mesh.parent,model);assert(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));}
  const xs=globalCenterReplacement.footprint.map(p=>p[0]),zs=globalCenterReplacement.footprint.map(p=>p[1]);
  assert(Math.abs(bounds.min.y+.12)<1e-6);assert(bounds.max.y>=32&&bounds.max.y<32.5);
  assert(bounds.min.x>=Math.min(...xs)-.7&&bounds.max.x<=Math.max(...xs)+.7);
  assert(bounds.min.z>=Math.min(...zs)-.7&&bounds.max.z<=Math.max(...zs)+.7);
});
check('At most eight merged material batches; meaningful graduated screen apertures',()=>{
  assert(modelMeshes.length>0&&modelMeshes.length<=8);
  assert(new Set(modelMeshes.map(m=>m.material)).size<=8);
  const a=model.userData.architecture;assert(a.screenPanels>100);assert.equal(a.densityCounts.length,4);assert(a.densityCounts.every(n=>n>0));
  assert.equal(a.densityCounts.reduce((x,y)=>x+y,0),a.screenPanels);
  assert.equal(a.densityCounts.reduce((n,c,i)=>n+c*i,0),a.foliageApertures);
});
const config=fs.readFileSync('src/config.js','utf8'),main=fs.readFileSync('src/main.js','utf8');
check('Static integration registers GCASL among eleven unique landmarks',()=>{
  const ids=[...config.matchAll(/\{ id: '([^']+)'/g)].map(m=>m[1]);assert.equal(ids.length,11);assert.equal(new Set(ids).size,11);assert(ids.includes('nyu-global-center'));
  assert(main.includes("registerLandmark('nyu-global-center', globalCenter)"));assert(main.includes('scene.add(globalCenter)'));
  assert(main.indexOf('createKimmelModel(model)')<main.indexOf('createGlobalCenterModel(model)'));
});
check('Original GLB bytes are unchanged',()=>assert.equal(digest(fs.readFileSync(file)),initialHash));
results.geometry={original:2598,kimmelRemoved:k,globalCenterRemoved:g,remaining:count(original),meshes:modelMeshes.length,triangles:count(model),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},architecture:model.userData.architecture};
fs.mkdirSync('evidence/m8-gcasl',{recursive:true});
fs.writeFileSync('evidence/m8-gcasl/tester-geometry-results.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
