import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { insideFootprint } from './geometry.js';

export const globalCenterReplacement = {
  tile: 'tile--1_0.glb', datasetFootprintIndex: 11021,
  datasetHeightRange: [1.2408, 32.0613],
  footprint: [[-50.437,81.569],[-59.836,96.138],[-66.416,106.337],[-68.001,108.794],[-68.241,109.166],[-62.503,112.868],[-75.336,132.761],[-77.342,135.871],[-84.503,131.251],[-95.756,123.992],[-97.008,123.184],[-83.204,102.689],[-82.417,101.521],[-72.68,87.064],[-70.584,83.952],[-63.934,74.078],[-61.549,70.538],[-48.828,79.073]],
};

// The shared Kimmel boundary contains opposite walls and degenerate roof strips.
// Extraction and removal deliberately use the identical ownership predicate.
function belongs(points) {
  const footprint = globalCenterReplacement.footprint;
  if (!points.every(p => insideFootprint(p.x,p.z,footprint) && p.y >= 1.14 && p.y <= 32.17)) return false;
  const [a,b,c] = points, center = a.clone().add(b).add(c).multiplyScalar(1/3);
  if (!insideFootprint(center.x,center.z,footprint)) return false;
  const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  const inward = insideFootprint(center.x-normal.x*.25,center.z-normal.z*.25,footprint,0);
  const outward = insideFootprint(center.x+normal.x*.25,center.z+normal.z*.25,footprint,0);
  if (Math.hypot(normal.x,normal.z)>.1 && !inward && outward) return false;
  const area = Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/2;
  return !(Math.abs(normal.y)>.9 && area<.1);
}

function visit(root, callback) {
  root.updateMatrixWorld(true);
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const p=mesh.geometry.attributes.position, index=mesh.geometry.index;
    for(let i=0;i<(index?.count??p.count);i+=3) {
      const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);
      const points=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id).applyMatrix4(mesh.matrixWorld));
      callback(mesh,ids,points,belongs(points));
    }
  });
}

export function removeGlobalCenterGeometry(tileRoot) {
  const indices=new Map(); let removed=0;
  visit(tileRoot,(mesh,ids,points,matched)=>{
    if(!indices.has(mesh))indices.set(mesh,[]);
    if(matched)removed++;else indices.get(mesh).push(...ids);
  });
  for(const [mesh,keep] of indices) {
    mesh.geometry.setIndex(keep);mesh.geometry.clearGroups();
    mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
  }
  return removed;
}

/** Identity map-coordinate root. Call before removal; complete group participates
 * in selection, hover and bounds. Screen motifs approximate architect text;
 * no exterior photo inspection or surveyed facade dimensions are claimed. */
export function createGlobalCenterModel(tileRoot) {
  const source=[];
  visit(tileRoot,(mesh,ids,points,matched)=>{if(matched)source.push(points);});
  if(source.length!==88)throw new Error(`Global Center source mask expected 88 triangles, received ${source.length}.`);
  const colors={stone:'#bfaa80',stoneLight:'#cbb88f',glass:'#637d7c',frame:'#8a9187',roof:'#85887b',entrance:'#a6b5aa'};
  const batches=Object.fromEntries(Object.keys(colors).map(key=>[key,[]]));
  function add(g,key) {
    const plain=g.index?g.toNonIndexed():g;
    if(plain!==g)g.dispose();plain.deleteAttribute('uv');
    batches[key].push(plain);
  }
  function triangle(points,key) {
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));g.computeVertexNormals();add(g,key);
  }
  const north=new THREE.Vector3(.5421,0,-.8403).normalize();
  const east=new THREE.Vector3(.8403,0,.5421).normalize();
  const walls=new Map();
  for(const points of source) {
    const [a,b,c]=points, normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const lo=Math.min(...points.map(p=>p.y)),hi=Math.max(...points.map(p=>p.y));
    // Source facade itself becomes glass behind open screen, preventing stone
    // from filling the actual perforations. Party walls retain solid stone.
    const exposed=Math.abs(normal.y)<.1&&normal.dot(east)<.8;
    triangle(points,Math.abs(normal.y)>.7?'roof':exposed&&hi>5?'glass':'stone');
    if(!exposed)continue;
    const ends=[...new Map(points.map(p=>[`${p.x.toFixed(2)},${p.z.toFixed(2)}`,[p.x,p.z]])).values()];
    if(ends.length!==2)continue;
    ends.sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
    const key=JSON.stringify([ends.map(p=>p.map(v=>+v.toFixed(2))),+lo.toFixed(2),+hi.toFixed(2)]);
    walls.set(key,{a:ends[0],b:ends[1],normal,lo,hi});
  }
  let panels=0,apertures=0,mullions=0;
  const densityCounts=[0,0,0,0];
  for(const {a,b,normal,lo,hi} of walls.values()) {
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length<.6||hi-lo<.5)continue;
    const tangent=new THREE.Vector3((b[0]-a[0])/length,0,(b[1]-a[1])/length);
    const transform=new THREE.Matrix4().makeBasis(tangent,new THREE.Vector3(0,1,0),normal).setPosition(a[0],0,a[1]);
    function box(t,y,w,h,d,key,offset=.12) {
      const g=new THREE.BoxGeometry(w,h,d);g.translate(t,y,offset+d/2);g.applyMatrix4(transform);add(g,key);
    }
    const bottom=Math.max(lo,5.1),top=hi-.12;
    if(top>bottom+.3) {
      const columns=Math.max(1,Math.round(length/1.5)),rows=Math.max(1,Math.round((top-bottom)/2.65));
      const width=length/columns,height=(top-bottom)/rows;
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
        const cy=bottom+(row+.5)*height,cx=(col+.5)*width;
        const level=cy<10?0:cy<17?1:cy<24?2:3;
        // Three deterministic variations in each of four opening densities.
        // Cutouts are abstract foliage, not a transcription of the real artwork.
        const variant=(col+row)%3, w=width-.055,h=height-.055;
        const shape=new THREE.Shape([new THREE.Vector2(-w/2,-h/2),new THREE.Vector2(w/2,-h/2),new THREE.Vector2(w/2,h/2),new THREE.Vector2(-w/2,h/2)]);
        for(let leaf=0;leaf<level;leaf++) {
          const px=(leaf%2===0?-.18:.18)*w,py=(-.3+(leaf/(Math.max(level-1,1)))*.6)*h;
          const rx=w*(.12+level*.015),ry=h*(.10+level*.015),tilt=(variant-1)*.09*w;
          const hole=new THREE.Path();hole.moveTo(px-rx,py);hole.lineTo(px+tilt,py+ry);hole.lineTo(px+rx,py);hole.lineTo(px-tilt,py-ry);hole.closePath();shape.holes.push(hole);apertures++;
        }
        const g=new THREE.ShapeGeometry(shape);g.translate(cx,cy,.24);g.applyMatrix4(transform);add(g,(col+row)%4===0?'stoneLight':'stone');
        panels++;densityCounts[level]++;
      }
      for(let c=0;c<=columns;c++){box(c*width,(bottom+top)/2,.045,top-bottom,.06,'frame',.055);mullions++;}
      for(let row=0;row<=rows;row++)box(length/2,bottom+row*height,length,.065,.065,'frame',.055);
    }
    // A restrained glazed ground floor; only park-facing facade gets an entry.
    if(lo<2&&hi>5) {
      const n=Math.max(1,Math.round(length/2.4)),pitch=length/n;
      for(let c=0;c<n;c++) {
        box((c+.5)*pitch,3.15,pitch-.20,3.4,.06,'glass',.08);
        box(c*pitch,3.15,.09,3.5,.08,'frame');
      }
      box(length/2,5.04,length,.22,.28,'stoneLight');
      if(normal.dot(north)>.93&&length>8) {
        box(length*.5,2.9,3.25,3.15,.10,'entrance',.18);
        box(length*.5,2.9,.075,3.2,.08,'frame',.31);
        box(length*.5,4.57,3.65,.16,.65,'stoneLight',.15);
      }
    }
    // Thin edge cap remains close to the original roof height.
    if(hi>24)box(length/2,hi+.04,length,.12,.24,'stoneLight',-.05);
  }
  const shape=new THREE.Shape(globalCenterReplacement.footprint.map(([x,z])=>new THREE.Vector2(x,-z)));
  const base=new THREE.ExtrudeGeometry(shape,{depth:1.37,steps:1,bevelEnabled:false});
  base.rotateX(-Math.PI/2);base.translate(0,-.12,0);add(base,'stone');
  const root=new THREE.Group();root.name='Global Center for Academic and Spiritual Life';
  for(const [key,geometries] of Object.entries(batches)) {
    if(!geometries.length)continue;
    const g=mergeGeometries(geometries,false);geometries.forEach(p=>p.dispose());
    const material=new THREE.MeshStandardMaterial({color:colors[key],roughness:key==='glass'?.3:.85,metalness:key==='frame'?.25:0,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(g,material);mesh.name=`Global Center ${key}`;root.add(mesh);
  }
  root.userData={buildingId:'nyu-global-center',coordinateSpace:'Washington Square map meters; identity transform',modelFidelity:'Source massing and architect-text-informed screen approximation; exterior photo and browser validation pending.',architecture:{sourceTriangles:source.length,screenPanels:panels,foliageApertures:apertures,densityCounts,mullions,reference:'docs/global-center-reference.md'}};
  return root;
}
