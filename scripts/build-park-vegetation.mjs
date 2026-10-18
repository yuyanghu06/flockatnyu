import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Document,NodeIO} from '@gltf-transform/core';
import * as THREE from 'three';
import {prepareStreetSurfaces} from '../src/streets.js';
import {planParkVegetation,createParkVegetation,diskFits,clearExisting} from '../src/park-vegetation.js';
import {createGouldPlaza} from '../src/gould-plaza.js';

const io=new NodeIO(),hash=b=>createHash('sha256').update(b).digest('hex');
const dataPath='assets/campus-assets/data/streets-parks.json';
const sourcePaths=[dataPath,'src/gould-plaza.js',...['washington-square-trees','courant-garden','washington-square-fountain'].map(n=>`assets/yuyang-site-3d-assets/models/environment/${n}.glb`)];
const sourceHashes={},existing=[];
for(const path of sourcePaths){
  const bytes=await fs.readFile(path);sourceHashes[path]=hash(bytes);if(!path.endsWith('.glb'))continue;
  const doc=await io.readBinary(new Uint8Array(bytes));
  for(const node of doc.getRoot().listNodes())if(node.getMesh()){
    const bounds=new THREE.Box3(),matrix=new THREE.Matrix4().fromArray(node.getWorldMatrix()),point=new THREE.Vector3();
    for(const primitive of node.getMesh().listPrimitives()){
      const a=primitive.getAttribute('POSITION'),element=[];
      for(let i=0;i<a.getCount();i++){a.getElement(i,element);point.fromArray(element).applyMatrix4(matrix);bounds.expandByPoint(point);}
    }
    if(!bounds.isEmpty())existing.push({source:path,minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z});
  }
}
// Gould's old exported GLB is replaced at runtime. Build the current procedural
// object offline and conservatively protect its complete plaza footprint.
const gould=createGouldPlaza();gould.updateMatrixWorld(true);
const gouldBounds=new THREE.Box3().setFromObject(gould);
existing.push({source:'src/gould-plaza.js:createGouldPlaza',minX:gouldBounds.min.x,maxX:gouldBounds.max.x,minZ:gouldBounds.min.z,maxZ:gouldBounds.max.z});
gould.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});
const data=JSON.parse(await fs.readFile(dataPath,'utf8'));
console.log('Preparing street and building exclusion polygons');
const prepared=prepareStreetSurfaces(data);
console.log('Planning vegetation');
const plan=planParkVegetation(data,prepared,existing,message=>console.log(message));
assert.deepEqual(plan.placements,planParkVegetation(data,prepared,existing).placements,'deterministic placement');
for(const p of plan.placements){
  assert.ok(diskFits(p.x,p.z,p.radius+.45,plan.eligibleByPark[p.parkId]),'eligible cover and crown margin');
  assert.ok(clearExisting(p.x,p.z,p.radius+.75,existing),'existing geometry clearance');
}
let minimumGap=Infinity;
for(let i=0;i<plan.placements.length;i++)for(let j=i+1;j<plan.placements.length;j++){
  const a=plan.placements[i],b=plan.placements[j],gap=Math.hypot(a.x-b.x,a.z-b.z)-a.radius-b.radius;minimumGap=Math.min(minimumGap,gap);assert.ok(gap>=1.25-1e-9,'crown spacing');
}
const model=createParkVegetation(data,prepared,existing,plan),doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Supplemental park vegetation');doc.getRoot().setDefaultScene(scene);
const e=data.metadata.extent;
for(const mesh of model.children){
  const g=mesh.geometry,b=g.boundingBox;
  assert.ok(b.min.x>=e.minX&&b.max.x<=e.maxX&&b.min.z>=e.minZ&&b.max.z<=e.maxZ,'geometry extent');
  for(const value of g.attributes.position.array)assert.ok(Number.isFinite(value),'finite geometry');
  const material=doc.createMaterial(mesh.name).setBaseColorFactor([...mesh.material.color.toArray(),1]).setRoughnessFactor(1).setMetallicFactor(0),primitive=doc.createPrimitive().setMaterial(material);
  for(const [name,semantic] of [['position','POSITION'],['normal','NORMAL']])primitive.setAttribute(semantic,doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes[name].array)).setBuffer(buffer));
  scene.addChild(doc.createNode(mesh.name).setMesh(doc.createMesh(mesh.name).addPrimitive(primitive)));
}
for(const[path,before]of Object.entries(sourceHashes))assert.equal(hash(await fs.readFile(path)),before,'source preserved');
const metadata={...model.userData,attribution:'© OpenStreetMap contributors',attributionUrl:data.metadata.attributionUrl,extent:e,sourceHashes,existingExclusionCount:existing.length,existingExclusions:existing,minimumCrownGap:minimumGap,parks:plan.reports,placements:plan.placements,checks:{deterministic:true,eligibleCoverAndMargin:true,existingGeometryClearance:true,minimumSpacing:true,finiteGeometry:true,extent:true,sourceHashesPreserved:true},limitations:'Illustrative additions only in explicit mapped vegetation cover; unmapped planting not guessed. Existing source meshes use conservative world AABBs. Browser appearance not verified.'};
scene.setExtras(model.userData);
await fs.mkdir('assets/campus-assets/models/environment',{recursive:true});
await io.write('assets/campus-assets/models/environment/park-vegetation.glb',doc);
await fs.writeFile('assets/campus-assets/data/park-vegetation-render.json',JSON.stringify(metadata,null,2)+'\n');
await fs.mkdir('evidence/m10-park-vegetation',{recursive:true});
const baked=await fs.readFile('assets/campus-assets/models/environment/park-vegetation.glb');
await fs.writeFile('evidence/m10-park-vegetation/coder-checks.json',JSON.stringify({...model.userData,bytes:baked.length,sha256:hash(baked),existingExclusionCount:existing.length,minimumCrownGap:minimumGap,checks:metadata.checks,parks:plan.reports},null,2)+'\n');
console.log(JSON.stringify({...model.userData,bytes:baked.length,minimumCrownGap:minimumGap,parks:plan.reports},null,2));
