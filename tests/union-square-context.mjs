import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'meshoptimizer';
import {insideFootprint} from '../src/map/landmarks/geometry.js';

// Source-only audit: no browser, server, network, or source-asset writes.
const base='assets/yuyang-site-3d-assets/models/buildings/';
const runtimePath='assets/yuyang-site-3d-assets/data/building-runtime.json';
const runtime=JSON.parse(fs.readFileSync(runtimePath));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const paths=[runtimePath,...['25-union-square-west.glb','235-park-avenue-south.glb','city-tiles/tile-2_-4.glb','city-tiles/tile-2_-3.glb','city-tiles/tile-4_-4.glb','city-tiles/tile-4_-5.glb'].map(x=>base+x)];
const sourceHashes=Object.fromEntries(paths.map(p=>[p,hash(fs.readFileSync(p))]));
await MeshoptDecoder.ready;
async function load(path){const b=fs.readFileSync(path);const root=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;root.updateMatrixWorld(true);return root;}
function triangles(root){const out=[];root.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position,index=m.geometry.index;for(let i=0;i<(index?.count??a.count);i+=3)out.push([0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(a,index?index.getX(i+j):i+j).applyMatrix4(m.matrixWorld)));});return out;}
function geometryHash(root){const parts=[];root.traverse(m=>{if(!m.isMesh)return;for(const a of Object.values(m.geometry.attributes)){const array=a.isInterleavedBufferAttribute?a.data.array:a.array;parts.push(hash(Buffer.from(array.buffer,array.byteOffset,array.byteLength)));}if(m.geometry.index)parts.push(hash(Buffer.from(m.geometry.index.array.buffer)));parts.push(JSON.stringify(m.matrixWorld.toArray()));});return hash(parts.join('|'));}
function inParcel(ts,footprint){return ts.filter(t=>t.every(v=>insideFootprint(v.x,v.z,footprint,.08)));}
const report={checks:[],sourceHashes,models:[],tiles:[],browser:'Not attempted; source geometry audit only'};
const check=(name,fn)=>{fn();report.checks.push({name,pass:true});};
const tiles=[];
for(const name of ['tile-2_-4.glb','tile-2_-3.glb','tile-4_-4.glb','tile-4_-5.glb']){const root=await load(base+'city-tiles/'+name);tiles.push({name,root,ts:triangles(root),signature:geometryHash(root)});}
for(const [name,id,count,expectedMin,expectedMax] of [
  ['25-union-square-west.glb',5449,3460,[501.809,5.56,-623.013],[532.222,55.125,-589.758]],
  ['235-park-avenue-south.glb',5389,5058,[793.264,3.57,-779.974],[839.786,60.66,-749.98]],
]){
  const root=await load(base+name),before=geometryHash(root),ts=triangles(root),bounds=new THREE.Box3().setFromObject(root),footprint=runtime.footprints[id];
  const matching=tiles.flatMap(t=>inParcel(t.ts,footprint));
  const horizontal=matching.filter(t=>Math.max(...t.map(p=>p.y))-Math.min(...t.map(p=>p.y))<.05);
  check(name+' source triangle count and known world placement',()=>{assert.equal(ts.length,count);for(let i=0;i<3;i++){assert.ok(Math.abs(bounds.min.toArray()[i]-expectedMin[i])<.001);assert.ok(Math.abs(bounds.max.toArray()[i]-expectedMax[i])<.001);}assert.deepEqual(root.position.toArray(),[0,0,0]);assert.deepEqual(root.scale.toArray(),[1,1,1]);});
  check(name+' X/Z bounds match recorded source parcel',()=>{const xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[1]);assert.ok(Math.abs(bounds.min.x-Math.min(...xs))<.001&&Math.abs(bounds.max.x-Math.max(...xs))<.001&&Math.abs(bounds.min.z-Math.min(...zs))<.001&&Math.abs(bounds.max.z-Math.max(...zs))<.001);});

  check(name+' city tiles lack horizontal surfaces at the restored model elevation',()=>assert.equal(horizontal.filter(t=>t.some(v=>v.y>=expectedMin[1]-.1)).length,0));
  if(id===5449)check('Carlyle parcel matches are only adjoining parcel boundary walls',()=>{
    assert.equal(matching.length,8);
    assert.ok(matching.every(t=>[5886,5897].some(neighbor=>t.every(v=>insideFootprint(v.x,v.z,runtime.footprints[neighbor],.08)))));
  });
  root.traverse(m=>{if(m.isMesh){m.material=new THREE.MeshStandardMaterial({color:'#dedfdb',vertexColors:false,roughness:1});}});
  check(name+' context material preserves every geometry attribute/index/transform',()=>assert.equal(geometryHash(root),before));
  report.models.push({file:name,footprintIndex:id,triangles:ts.length,min:bounds.min.toArray(),max:bounds.max.toArray(),tileBoundaryTriangles:matching.length,tileHorizontalTriangles:horizontal.length,geometryHash:before});
}
const carlyleTile=tiles.find(t=>t.name==='tile-2_-4.glb');
for(const id of [5507,5886,5897,6270,6362]){
  const count=inParcel(carlyleTile.ts,runtime.footprints[id]).length;
  check('Neighbor parcel '+id+' remains represented',()=>assert.ok(count>0));
  report.tiles.push({tile:carlyleTile.name,neighborFootprintIndex:id,triangles:count});
}
check('All inspected tile buffers and transforms remain identical',()=>tiles.forEach(t=>assert.equal(geometryHash(t.root),t.signature)));
check('Every source file hash remains unchanged',()=>Object.entries(sourceHashes).forEach(([p,h])=>assert.equal(hash(fs.readFileSync(p)),h)));
fs.mkdirSync('evidence/m11-union-context',{recursive:true});
fs.writeFileSync('evidence/m11-union-context/source-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));


