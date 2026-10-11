import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { insideFootprint } from './geometry.js';

// Host is 12–16 Washington Place / 240–242 Greene Street, BIN1008812.
// The ground-floor Leslie eLab is a tenant, not a separate freestanding building.
export const leslieElabReplacement = {
  tile: 'tile-0_0.glb', datasetFootprintIndex: 11174,
  footprint: [[200.654,148.589],[193.292,159.967],[192.284,160.606],[190.141,159.219],[185.231,166.807],[172.454,158.54],[169.048,156.336],[167.897,158.114],[158.789,152.221],[157.575,151.435],[161.028,146.098],[169.16,133.529],[171.586,129.781],[178.373,134.173],[193.172,143.748]],
  datasetHeightRange: [-0.091,59.421],
};

/** Extract before removing the matching tile triangles. Returns an identity-root
 * Group with world/map coordinates baked into all geometry. Source tile untouched.
 * Attach buildingId nyu-leslie-elab-building to this entire returned group.
 */
export function createLeslieElabModel(tileRoot) {
  tileRoot.updateMatrixWorld(true);
  const triangles=[];
  tileRoot.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const position=mesh.geometry.getAttribute('position'), index=mesh.geometry.getIndex();
    for(let i=0;i<(index?index.count:position.count);i+=3) {
      const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(position,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
      if(points.every(p=>insideFootprint(p.x,p.z,leslieElabReplacement.footprint)&&p.y>=-.191&&p.y<=59.521))triangles.push(points);
    }
  });
  if(!triangles.length)throw new Error('Leslie eLab host geometry is missing from tile-0_0');
  const colors={brick:'#b8aa89',stone:'#d5ccb5',glass:'#40565c',frame:'#3b3a36',roof:'#777c75',metal:'#9a9d96',purple:'#64517f'};
  const batches=Object.fromEntries(Object.keys(colors).map(k=>[k,[]]));
  const walls=new Map();
  function add(g,key) {
    const plain=g.index?g.toNonIndexed():g;
    if(plain!==g)g.dispose();plain.deleteAttribute('uv');batches[key].push(plain);
  }
  function box(x,y,z,w,h,d,key,angle=0) {
    const g=new THREE.BoxGeometry(w,h,d);g.rotateY(angle);g.translate(x,y,z);add(g,key);
  }
  for(const points of triangles) {
    const [a,b,c]=points;
    const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));g.computeVertexNormals();
    add(g,Math.abs(normal.y)>.8?'roof':Math.min(...points.map(p=>p.y))>47.5?'metal':'brick');
    if(Math.abs(normal.y)>.1)continue;
    // A CityGML vertical face is represented by two triangles. Deduplicate its
    // plan endpoints and Y range; no guessed boxes replace source setbacks.
    const plan=[...new Map(points.map(p=>[`${p.x.toFixed(2)},${p.z.toFixed(2)}`,[p.x,p.z]])).values()];
    if(plan.length!==2)continue;
    plan.sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
    const lo=Math.min(...points.map(p=>p.y)),hi=Math.max(...points.map(p=>p.y));
    const key=JSON.stringify([plan.map(p=>p.map(n=>+n.toFixed(2))),+lo.toFixed(2),+hi.toFixed(2)]);
    walls.set(key,{a:plan[0],b:plan[1],lo,hi,normal});
  }
  let windowCount=0,storefrontCount=0;
  const north=new THREE.Vector3(.543,0,-.840),west=new THREE.Vector3(-.840,0,-.543);
  for(const {a,b,lo,hi,normal} of walls.values()) {
    const dx=b[0]-a[0],dz=b[1]-a[1],span=Math.hypot(dx,dz);
    if(span<1.25||hi-lo<2)continue;
    const tx=dx/span,tz=dz/span,angle=-Math.atan2(tz,tx);
    const publicFace=normal.dot(north)>.95||normal.dot(west)>.95;
    const nx=normal.x,nz=normal.z;
    function faceBox(t,y,w,h,depth,key,offset=.04) {
      box(a[0]+tx*t+nx*(depth/2+offset),y,a[1]+tz*t+nz*(depth/2+offset),w,h,depth,key,angle);
    }
    // Preserve unobserved service-side massing; fenestration is conservative.
    if(hi>48&&lo>43)continue;
    const bays=Math.max(1,Math.round(span/(publicFace?2.65:3.4))),pitch=span/bays;
    const rows=Array.from({length:13},(_,row)=>6.1+row*3.17);
    // The shallow top occupied setback has its own floor datum. Keep the
    // mechanical enclosure above 48m blank, but fit this residential row.
    if(lo>43&&hi<48&&hi-lo>2.6)rows.push((lo+hi)/2);
    for(const [row,y] of rows.entries()) {
      if(y-1.05<lo+.22||y+1.05>hi-.35)continue;
      for(let col=0;col<bays;col++) {
        const t=(col+.5)*pitch,w=Math.min(pitch-.65,publicFace?1.48:1.18);
        if(w<.6)continue;
        faceBox(t,y,w+ .15,2.05,.08,'frame');
        faceBox(t,y,w,1.9,.09,'glass',.09);
        faceBox(t,y,w,.065,.14,'frame',.08);
        faceBox(t,y,.055,1.9,.14,'frame',.08);
        faceBox(t,y-.995,w+.22,.12,.30,'stone',.02);
        if(publicFace&&(row+col*3)%11===0)faceBox(t,y-.64,w*.60,.39,.47,'metal',.11);
        windowCount++;
      }
    }
    if(publicFace&&lo<.1&&hi>5) {
      // Cream masonry piers and dark storefront occupy the street-level base.
      const count=Math.max(1,Math.round(span/3.6)),p=span/count;
      faceBox(span/2,4.5,span,.65,.18,'stone');
      faceBox(span/2,.32,span,.6,.18,'stone');
      for(let col=0;col<count;col++) {
        const t=(col+.5)*p;
        faceBox(t,2.2,p-.5,3.55,.12,'frame');
        faceBox(t,2.25,p-.7,3.22,.16,'glass',.09);
        faceBox(t,3.34,p-.66,.08,.20,'frame',.08);
        faceBox(t,2.2,.08,3.5,.20,'frame',.08);
        faceBox(col*p+.1,2.1,.24,4.1,.28,'stone');
        storefrontCount++;
      }
      faceBox(span-.1,2.1,.24,4.1,.28,'stone');
      // Only the Washington Place frontage gets the eLab's purple banner cue.
      if(normal.dot(north)>.95&&span>12)faceBox(span*.19,5.6,.68,2.4,.18,'purple',.25);
    }
    // Small projecting stone caps emphasize the observed Art Deco setbacks.
    if(publicFace&&hi>30&&hi<48)faceBox(span/2,hi-.14,span,.23,.34,'stone',.015);
  }
  const root=new THREE.Group();root.name='12–16 Washington Place — Leslie eLab host';
  root.userData={buildingId:'nyu-leslie-elab-building',modelFidelity:'Original CityGML massing; photo-informed facade approximation',coordinateSpace:'Baked Washington Square map meters; identity root',sourceFootprintIndex:11174,sourceTriangles:triangles.length,windowCount,storefrontCount};
  for(const[key,list]of Object.entries(batches)) {
    if(!list.length)continue;
    const geometry=mergeGeometries(list,false);geometry.computeBoundingBox();geometry.computeBoundingSphere();list.forEach(g=>g.dispose());
    const material=new THREE.MeshStandardMaterial({color:colors[key],roughness:key==='glass'?.48:.94,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`Leslie host ${key}`;root.add(mesh);
  }
  return root;
}
