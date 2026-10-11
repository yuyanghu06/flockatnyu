import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {containsPark, unionStreetPolygons as union, subtractStreetPolygons as subtract, intersectStreetPolygons as intersect} from './streets.js';

export const VEGETATION_SEED=104729;
const ground=t=>t.location!=='roof'&&(!t.bridge||t.bridge==='no')&&(!t.layer||Number(t.layer)===0)&&(!t.level||Number(t.level)===0);
export const isPlantCover=t=>ground(t)&&(['grass','flowerbed','forest','meadow'].includes(t.landuse)||['wood','scrub','grassland','heath'].includes(t.natural)||t.leisure==='garden'||['grass','garden','wood','scrub'].includes(t.landcover));
export const isHardCover=t=>['pitch','playground','sports_centre','swimming_pool','dog_park'].includes(t.leisure)||t.natural==='water'||Boolean(t.water)||t.amenity==='fountain'||t.highway==='pedestrian'||['plaza','construction'].includes(t.landuse)||['concrete','asphalt','paving_stones','paved','gravel'].includes(t.surface);
const ringArea=r=>Math.abs(r.reduce((s,a,i)=>{const b=r[(i+1)%r.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2);
export const polygonArea=p=>p.reduce((s,rings)=>s+ringArea(rings[0])-rings.slice(1).reduce((n,r)=>n+ringArea(r),0),0);
function rng(key){let n=VEGETATION_SEED;for(const c of key)n=Math.imul(n^c.charCodeAt(0),16777619);return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const distanceSegment=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);};
export function diskFits(x,z,radius,polygons){
  if(!containsPark(x,z,polygons))return false;
  for(const rings of polygons)for(const ring of rings)for(let i=0;i<ring.length;i++)if(distanceSegment(x,z,ring[i],ring[(i+1)%ring.length])<radius)return false;
  return true;
}
export function clearExisting(x,z,radius,boxes){return boxes.every(b=>Math.hypot(x-Math.max(b.minX,Math.min(b.maxX,x)),z-Math.max(b.minZ,Math.min(b.maxZ,z)))>=radius);}

/** Pure deterministic layout. Explicit vegetation cover is required: a general
 * park boundary never implies that its hardscape, courts or plaza is plantable.
 * Existing boxes are per source mesh in world coordinates, not whole-park masks.
 */
export function planParkVegetation(data,prepared,existingExclusions=[],progress=()=>{}){
  const e=data.metadata.extent,extent=[[[[e.minX,e.minZ],[e.maxX,e.minZ],[e.maxX,e.maxZ],[e.minX,e.maxZ]]]];
  const all=data.parks??[],parks=all.filter(p=>p.tags.leisure==='park').sort((a,b)=>a.id.localeCompare(b.id));
  const cover=union(all.filter(p=>isPlantCover(p.tags)&&!isHardCover(p.tags)).map(p=>p.rings));
  progress('Cover prepared');
  const obstacleGroups=[prepared.buildingFootprints,prepared.pathFootprints,prepared.roads,prepared.sidewalks,prepared.curbs,all.filter(p=>isHardCover(p.tags)).map(p=>p.rings)].filter(Boolean);
  let plantable=intersect(cover,extent);
  for(const mask of obstacleGroups)plantable=subtract(plantable,mask);
  const placements=[],reports=[],eligibleByPark={};
  progress('Exclusions prepared');
  for(const park of parks){
    progress(park.id);
    const report={id:park.id,name:park.tags.name??'Unnamed park',trees:0,shrubs:0,eligibleArea:0};reports.push(report);
    if(!ground(park.tags)){report.reason='Elevated or roof park; ground planting omitted';continue;}
    const clipped=intersect([park.rings],extent);
    if(!clipped.length){report.reason='Outside loaded map extent';continue;}
    const eligible=intersect(plantable,clipped);eligibleByPark[park.id]=eligible;report.eligibleArea=Number(polygonArea(eligible).toFixed(2));
    if(!eligible.length||report.eligibleArea<2){report.reason='No explicit eligible vegetation cover after exclusions';continue;}
    const points=eligible.flat(2),minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minZ=Math.min(...points.map(p=>p[1])),maxZ=Math.max(...points.map(p=>p[1])),random=rng(park.id);
    for(const kind of ['tree','shrub']){
      const desired=Math.min(kind==='tree'?28:22,Math.ceil(report.eligibleArea/(kind==='tree'?550:180)));
      let count=0;
      for(let attempt=0;attempt<3000&&count<desired&&placements.length<500;attempt++){
        const x=minX+random()*(maxX-minX),z=minZ+random()*(maxZ-minZ),radius=kind==='tree'?2+random():.65+random()*.35;
        if(!diskFits(x,z,radius+.45,eligible)||!clearExisting(x,z,radius+.75,existingExclusions))continue;
        if(placements.some(p=>Math.hypot(x-p.x,z-p.z)<radius+p.radius+1.25))continue;
        const height=kind==='tree'?5.5+random()*2.5:.7+random()*.45;
        placements.push({parkId:park.id,kind,x,z,y:.715,radius,height,variant:Math.floor(random()*2)});count++;report[kind==='tree'?'trees':'shrubs']++;
      }
    }
    report.reason=report.trees+report.shrubs?'Added within eligible uncovered planting areas':'Eligible cover too narrow, occupied by existing geometry, or spacing constrained';
  }
  return {placements,reports,eligibleByPark,existingExclusions,seed:VEGETATION_SEED,sourceParkParts:parks.length,groundParkParts:parks.filter(p=>ground(p.tags)).length,sourceSurfaceParts:all.length};
}

export function createParkVegetation(data,prepared,existingExclusions=[],plan=planParkVegetation(data,prepared,existingExclusions)){
  const root=new THREE.Group();root.name='Supplemental park vegetation';
  const batches={trunk:[],leaf:[],leafLight:[],shrub:[]};
  const add=(key,g)=>{g.deleteAttribute('uv');if(g.index){const old=g;g=g.toNonIndexed();old.dispose();}batches[key].push(g);};
  for(const p of plan.placements){
    if(p.kind==='tree'){
      const trunkHeight=p.height*.55,g=new THREE.CylinderGeometry(.16,.23,trunkHeight,7);g.translate(p.x,p.y+trunkHeight/2,p.z);add('trunk',g);
      const crown=new THREE.IcosahedronGeometry(1,1);crown.scale(p.radius,p.height*.34,p.radius);crown.translate(p.x,p.y+p.height*.66,p.z);add(p.variant?'leafLight':'leaf',crown);
    }else{const g=new THREE.IcosahedronGeometry(1,1);g.scale(p.radius,p.height/2,p.radius);g.translate(p.x,p.y+p.height/2,p.z);add('shrub',g);}
  }
  const colors={trunk:'#685139',leaf:'#789457',leafLight:'#8aa461',shrub:'#6f8d50'};
  for(const[key,list]of Object.entries(batches))if(list.length){const g=mergeGeometries(list,false);list.forEach(x=>x.dispose());g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:colors[key],roughness:1}));mesh.name=`Park vegetation ${key}`;root.add(mesh);}
  root.userData={seed:plan.seed,trees:plan.placements.filter(p=>p.kind==='tree').length,shrubs:plan.placements.filter(p=>p.kind==='shrub').length,sourceParkParts:plan.sourceParkParts,groundParkParts:plan.groundParkParts,sourceSurfaceParts:plan.sourceSurfaceParts,parksWithAdditions:plan.reports.filter(p=>p.trees+p.shrubs).length,meshCount:root.children.length,triangles:root.children.reduce((n,m)=>n+m.geometry.attributes.position.count/3,0),source:'OpenStreetMap eligible cover; deterministic illustrative planting, not surveyed tree inventory',coordinateSpace:'Washington Square meters; Y up; identity transform'};
  return root;
}
