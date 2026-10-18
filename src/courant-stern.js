import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Linear RGB signatures from the existing baked GLBs. They identify existing
// glazing and palette samples, not replacement colors for the source model.
const profiles = {
  courant: {
    glass: [[.01938,.03190,.03955]],
    trim: [.26636,.21953,.18116], mullion: [.12477,.08650,.07227],
  },
  stern: {
    glass: [[.09759,.13287,.14413],[.07619,.10462,.11193],[.18116,.31855,.39157]],
    trim: [.54572,.52712,.47932], mullion: [.23455,.24228,.22697],
  },
};
const colorDistance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

/** Add details to actual source windows, preserving every original mesh,
 * position/index/color buffer and material. Call once before registration.
 * Returns the same root; all detail meshes inherit its building selection.
 */
function* windowDetailSteps(root, name) {
  if(root.userData.windowDetailing)return root;
  const profile=profiles[name],triangles=[],samples=[];
  root.updateMatrixWorld(true);
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const g=mesh.geometry,p=g.getAttribute('position'),c=g.getAttribute('color'),idx=g.getIndex();
    if(!p||!c)return;
    const palette=new Map();
    for(let i=0;i<c.count;i++) {
      const rgb=[c.getX(i),c.getY(i),c.getZ(i)],key=rgb.map(v=>v.toFixed(6)).join(',');
      if(!palette.has(key))palette.set(key,rgb);
    }
    for(const rgb of palette.values())samples.push({rgb,material:Array.isArray(mesh.material)?mesh.material[0]:mesh.material});
    const glazing=i=>profile.glass.some(rgb=>colorDistance(rgb,[c.getX(i),c.getY(i),c.getZ(i)])<.0001);
    for(let i=0;i<(idx?.count??p.count);i+=3) {
      const ids=[0,1,2].map(k=>idx?idx.getX(i+k):i+k);
      if(!ids.every(glazing))continue;
      const points=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id).applyMatrix4(mesh.matrixWorld));
      triangles.push(points);
    }
  });
  if(!triangles.length)throw new Error(`${name}: existing glass geometry not found`);
  const nearest=target=>samples.reduce((best,s)=>colorDistance(s.rgb,target)<colorDistance(best.rgb,target)?s:best,samples[0]);
  const trim=nearest(profile.trim),mullion=nearest(profile.mullion);
  if(colorDistance(trim.rgb,profile.trim)>.0001||colorDistance(mullion.rgb,profile.mullion)>.0001)throw new Error(`${name}: original facade palette changed; review window details`);

  // The baked windows are shallow boxes. Join triangle vertices by position,
  // independently of duplicated hard-edge normals and per-face indices.
  const parents=triangles.map((_,i)=>i),owners=new Map();
  const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  const key=p=>p.toArray().map(v=>v.toFixed(5)).join(',');
  triangles.forEach((points,i)=>points.forEach(p=>{
    const k=key(p);if(owners.has(k))parents[find(i)]=find(owners.get(k));else owners.set(k,i);
  }));
  const components=new Map();
  triangles.forEach((points,i)=>{const id=find(i);if(!components.has(id))components.set(id,[]);components.get(id).push(points);});
  const batches={trim:[],mullion:[]},raycaster=new THREE.Raycaster();
  let windows=0,faces=0,occludedFaces=0;
  function box(center,width,height,depth,angle,material) {
    const g=new THREE.BoxGeometry(width,height,depth);g.rotateY(angle);g.translate(...center.toArray());
    const plain=g.toNonIndexed();g.dispose();plain.deleteAttribute('uv');batches[material].push(plain);
  }
  for(const component of components.values()) {
    // Yield only between complete components; source geometry is unchanged and
    // merged detail meshes are attached atomically after the final component.
    yield;
    const planes=new Map();
    for(const points of component) {
      const [a,b,c]=points,cross=b.clone().sub(a).cross(c.clone().sub(a)),area=cross.length()*.5;
      if(area<1e-8)continue;
      const normal=cross.normalize();if(Math.abs(normal.y)>.02)continue;
      const k=normal.toArray().map(v=>v.toFixed(3)).join(',')+','+normal.dot(a).toFixed(3);
      if(!planes.has(k))planes.set(k,{normal,area:0,points:[]});
      const plane=planes.get(k);plane.area+=area;plane.points.push(...points);
    }
    const candidates=[...planes.values()].sort((a,b)=>b.area-a.area);
    if(!candidates.length)continue;
    let used=false;
    // Both broad faces are considered; the back face points into the wall and
    // is discarded by a short source-only ray. No detail is guessed from a grid.
    for(const face of candidates.filter(p=>p.area>=candidates[0].area*.80)) {
      const n=face.normal,t=new THREE.Vector3(n.z,0,-n.x),ys=face.points.map(p=>p.y),ts=face.points.map(p=>p.dot(t));
      const minY=Math.min(...ys),maxY=Math.max(...ys),minT=Math.min(...ts),maxT=Math.max(...ts),w=maxT-minT,h=maxY-minY;
      if(w<.35||h<.6||w>9||h>9)continue;
      const center=t.clone().multiplyScalar((minT+maxT)/2).addScaledVector(n,n.dot(face.points[0]));center.y=(minY+maxY)/2;
      raycaster.set(center.clone().addScaledVector(n,.006),n);raycaster.near=.003;raycaster.far=.5;
      if(raycaster.intersectObject(root,true).length){occludedFaces++;continue;}
      const angle=-Math.atan2(t.z,t.x),line=Math.min(.065,Math.max(.035,w*.035));
      const at=(u,y,d)=>center.clone().addScaledVector(t,u).add(new THREE.Vector3(0,y,0)).addScaledVector(n,d);
      // Narrow borders sit just outside the existing glass, retaining its size,
      // color and reflections. The sill supplies the shallow projecting edge.
      box(at(-w/2-line/2,0,.037),line,h+line*2,.065,angle,'trim');
      box(at(w/2+line/2,0,.037),line,h+line*2,.065,angle,'trim');
      box(at(0,h/2+line/2,.037),w+line*2,line,.065,angle,'trim');
      box(at(0,-h/2-line/2,.065),w+line*3,.085,.13,angle,'trim');
      if(w>.85)box(at(0,0,.027),.035,h,.045,angle,'mullion');
      if(h>1.65)box(at(0,-h*.12,.027),w,.032,.045,angle,'mullion');
      faces++;used=true;
    }
    if(used)windows++;
  }
  if(!faces)throw new Error(`${name}: no exposed source window faces found`);
  const detailRoot=new THREE.Group();detailRoot.name=`${name} existing-window details`;
  const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert();
  for(const [role,list] of Object.entries(batches)) {
    if(!list.length)continue;
    const geometry=mergeGeometries(list,false);list.forEach(g=>g.dispose());geometry.applyMatrix4(inverse);geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const sample=role==='trim'?trim:mullion,material=sample.material.clone();
    material.vertexColors=false;material.color.setRGB(...sample.rgb);material.name=`${name} original palette ${role}`;
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`${name} merged ${role}`;detailRoot.add(mesh);
  }
  root.add(detailRoot);
  root.userData.windowDetailing={version:1,building:name,sourceGlassComponents:components.size,windows,faces,occludedFaces,addedMeshes:detailRoot.children.length,addedTriangles:detailRoot.children.reduce((n,m)=>n+m.geometry.attributes.position.count/3,0),sourcePalette:{trim:trim.rgb,mullion:mullion.rgb},method:'Existing pane boundaries; original buffers/materials unchanged; no replacement glass'};
  return root;
}

function enhanceWindows(model,name) {
  const steps=windowDetailSteps(model,name);
  let result;
  do { result=steps.next(); } while(!result.done);
  return result.value;
}

async function enhanceWindowsAsync(model,name) {
  const steps=windowDetailSteps(model,name);
  let deadline=performance.now()+8;
  for(;;) {
    const result=steps.next();
    if(result.done)return result.value;
    if(performance.now()>=deadline) {
      if(globalThis.scheduler?.yield)await globalThis.scheduler.yield();
      else await new Promise(resolve=>setTimeout(resolve,0));
      deadline=performance.now()+8;
    }
  }
}

export const enhanceCourant=model=>enhanceWindows(model,'courant');
export const enhanceStern=model=>enhanceWindows(model,'stern');
export const enhanceCourantAsync=model=>enhanceWindowsAsync(model,'courant');
export const enhanceSternAsync=model=>enhanceWindowsAsync(model,'stern');
