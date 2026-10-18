import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'meshoptimizer';
import {enhanceCourant,enhanceStern,enhanceCourantAsync,enhanceSternAsync} from '../../src/courant-stern.js';
await MeshoptDecoder.ready;
const hash=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
async function load(file){const b=fs.readFileSync(file);return(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;}
function signature(root){root.updateMatrixWorld(true);const meshes=[];root.traverse(n=>{if(!n.isMesh)return;const m=n.material;meshes.push({name:n.name,matrix:n.matrix.toArray(),world:n.matrixWorld.toArray(),attributes:Object.fromEntries(Object.entries(n.geometry.attributes).map(([k,a])=>[k,{count:a.count,itemSize:a.itemSize,normalized:a.normalized,hash:hash(a.array??a.data.array)}])),index:n.geometry.index?hash(n.geometry.index.array):null,groups:n.geometry.groups,material:{name:m.name,type:m.type,color:m.color?.toArray(),roughness:m.roughness,metalness:m.metalness,opacity:m.opacity,side:m.side,vertexColors:m.vertexColors,transparent:m.transparent,depthWrite:m.depthWrite},userData:n.userData});});const box=new THREE.Box3().setFromObject(root);return{meshes,userData:root.userData,bounds:{min:box.min.toArray(),max:box.max.toArray()}};}
const results=[];
for(const[name,sync,asyncFn]of[['courant',enhanceCourant,enhanceCourantAsync],['stern',enhanceStern,enhanceSternAsync]]){
 const file='assets/yuyang-site-3d-assets/models/buildings/'+(name==='courant'?'courant-institute':'stern-school-of-business')+'.glb';
 const a=await load(file),b=await load(file);const start=performance.now();assert.equal(sync(a),a);const syncMs=performance.now()-start;let yields=0;const saved=globalThis.scheduler;globalThis.scheduler={yield:async()=>{yields++;await new Promise(r=>setTimeout(r,0));}};
 const asyncStart=performance.now();try{assert.equal(await asyncFn(b),b);}finally{globalThis.scheduler=saved;}const asyncMs=performance.now()-asyncStart;const actual=signature(a),other=signature(b);assert.deepEqual(actual,other);assert(yields>0);results.push({building:name,syncMilliseconds:syncMs,asyncMilliseconds:asyncMs,yields,meshes:actual.meshes.length,windowDetailing:actual.userData.windowDetailing,signatureSha256:createHash('sha256').update(JSON.stringify(actual)).digest('hex'),exactEqual:true});
}
fs.writeFileSync('evidence/m43-smooth-reveal/window-builder-equivalence.json',JSON.stringify({results,limitations:['Node wall times are diagnostic, not browser/GPU benchmarks.','Exact geometry/index/material/transform/metadata equality checked on actual source GLBs.']},null,2)+'\n');console.log(JSON.stringify(results,null,2));
