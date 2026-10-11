import fs from 'node:fs/promises';
import { Document, NodeIO } from '@gltf-transform/core';
import { prepareStreetSurfaces, createStreets } from '../src/streets.js';
import { createParks } from '../src/parks.js';

const started=performance.now();
const data=JSON.parse(await fs.readFile('campus-assets/data/streets-parks.json','utf8'));
console.log('Preparing mapped surface polygons');
const prepared=prepareStreetSurfaces(data);
console.log('Building street mesh',Math.round(performance.now()-started));
const streets=createStreets(data,prepared);
console.log('Building park mesh',Math.round(performance.now()-started));
const groups=[streets,createParks(data,prepared)];
console.log('Writing baked model',Math.round(performance.now()-started));
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Mapped streets and parks');
doc.getRoot().setDefaultScene(scene);
const materials=new Map();
let triangles=0,meshes=0;
for(const root of groups) {
  root.updateMatrixWorld(true);
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),source=mesh.material;
    if(!materials.has(source))materials.set(source,doc.createMaterial(mesh.name)
      .setBaseColorFactor([...source.color.toArray(),source.opacity])
      .setRoughnessFactor(source.roughness??1).setMetallicFactor(source.metalness??0)
      .setDoubleSided(source.side===2));
    const primitive=doc.createPrimitive().setMaterial(materials.get(source));
    for(const [name,semantic] of [['position','POSITION'],['normal','NORMAL'],['uv','TEXCOORD_0'],['color','COLOR_0']]) {
      const a=geometry.attributes[name];if(!a)continue;
      primitive.setAttribute(semantic,doc.createAccessor().setType(a.itemSize===2?'VEC2':a.itemSize===4?'VEC4':'VEC3').setArray(new Float32Array(a.array)).setBuffer(buffer));
    }
    if(geometry.index)primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(geometry.index.array)).setBuffer(buffer));
    const node=doc.createNode(mesh.name).setMesh(doc.createMesh(mesh.name).addPrimitive(primitive));scene.addChild(node);
    triangles+=(geometry.index?.count??geometry.attributes.position.count)/3;meshes++;geometry.dispose();
  });
}
const metadata={source:'OpenStreetMap contributors',attributionUrl:data.metadata.attributionUrl,fetchedAt:data.metadata.fetchedAt,osmTimestamp:data.metadata.osmTimestamp,extent:data.metadata.extent,streets:groups[0].userData,parks:groups[1].userData,meshes,triangles};
scene.setExtras(metadata);
await fs.mkdir('campus-assets/models/environment',{recursive:true});
await new NodeIO().write('campus-assets/models/environment/streets-parks.glb',doc);
await fs.writeFile('campus-assets/data/streets-parks-render.json',JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({...metadata,bakeMilliseconds:Math.round(performance.now()-started)},null,2));
