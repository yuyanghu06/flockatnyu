import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Photo-informed approximation, not surveyed architecture. See docs/paulson-reference.md.
 * Returns one selectable Group with geometry baked in Washington Square MAP meters.
 * Root transform is identity: NEVER apply the extracted GLB's placement transform.
 * metadata is campus-assets/data/extracted-buildings.json's Paulson entry.
 */
export function createPaulsonModel(metadata) {
  const footprint = metadata.footprintMap;
  const origin = footprint[3];
  const ux = footprint[4][0] - origin[0], uz = footprint[4][1] - origin[1];
  const width = Math.hypot(ux, uz);
  const u = new THREE.Vector3(ux / width, 0, uz / width);
  const v = new THREE.Vector3(-u.z, 0, u.x); // positive toward Houston Street / south
  const ground = metadata.placement.position[1];
  const frame = new THREE.Matrix4().makeBasis(u, new THREE.Vector3(0, 1, 0), v);
  frame.setPosition(origin[0], ground, origin[1]);
  const polygon = footprint.map(([x, z]) => [(x-origin[0])*u.x+(z-origin[1])*u.z, (x-origin[0])*v.x+(z-origin[1])*v.z]);
  const length = Math.max(...polygon.map(p => p[1]));
  const colors = {
    glass: '#617f87', glassLight: '#8da4aa', glassBlue: '#6e909b', glassDark: '#45636c',
    mullion: '#46555b', metal: '#a8b5b7', roof: '#959f9c', planting: '#789068',
  };
  const batches = Object.fromEntries(Object.keys(colors).map(key => [key, []]));
  function add(geometry, material) {
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    if (plain !== geometry) geometry.dispose();
    plain.deleteAttribute('uv');
    batches[material].push(plain);
  }
  function box(x, y, z, w, h, d, material, angle = 0) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.rotateY(angle);
    geometry.translate(x, y, z);
    add(geometry, material);
  }
  function solid(x, z, w, d, bottom, top, material = 'glass') {
    box(x+w/2, (bottom+top)/2, z+d/2, w, top-bottom, d, material);
  }
  // Glazed five-story base follows the complete source footprint, not its AABB.
  const shape = new THREE.Shape(polygon.map(([x,z]) => new THREE.Vector2(x,-z)));
  const base = new THREE.ExtrudeGeometry(shape, {depth:25, bevelEnabled:false, steps:1});
  base.rotateX(-Math.PI/2);
  add(base, 'glass');
  const terrace = new THREE.ExtrudeGeometry(shape, {depth:0.48, bevelEnabled:false});
  terrace.rotateX(-Math.PI/2); terrace.translate(0,25,0); add(terrace,'roof');

  // Every facade component is baked into its material batch. No window objects.
  function facade(a, b, bottom, top, floors, mode, outward) {
    const dx=b[0]-a[0], dz=b[1]-a[1], span=Math.hypot(dx,dz);
    const tx=dx/span, tz=dz/span, nx=outward[0], nz=outward[1];
    const bays=Math.max(1,Math.round(span/(mode==='podium'?2.15:2.3)));
    const pitch=span/bays, story=(top-bottom)/floors;
    const angle=-Math.atan2(tz,tx);
    for(let floor=0;floor<floors;floor++) {
      const y=bottom+story*(floor+.5);
      for(let bay=0;bay<bays;bay++) {
        const t=(bay+.5)*pitch, variation=(bay*5+floor*7)%13;
        const projected=mode==='student' && variation<4;
        // Faculty and podium read as continuous curtain wall; strongly varied
        // individual projecting panels are specific to the student residence.
        const material=mode==='student'
          ? (variation<2?'glassLight':variation<6?'glassBlue':variation<8?'glassDark':'glass')
          : mode==='faculty' ? (bay%5===0?'glassBlue':'glass')
            : (bay%7===0?'glassBlue':'glass');
        const depth=projected?.48:.10;
        box(a[0]+tx*t+nx*(depth/2+.035), y, a[1]+tz*t+nz*(depth/2+.035),pitch-.11,story-.18,depth,material,angle);
        if(projected) box(a[0]+tx*t+nx*.31,y-story*.42,a[1]+tz*t+nz*.31,pitch-.06,.12,.66,'mullion',angle);
      }
      box((a[0]+b[0])/2+nx*.08,bottom+floor*story,(a[1]+b[1])/2+nz*.08,span,.13,.18,'mullion',angle);
    }
    for(let bay=0;bay<=bays;bay++) {
      const t=bay*pitch;
      const isFin=mode==='podium' || (mode==='faculty'&&bay%2===0);
      box(a[0]+tx*t+nx*.14,(bottom+top)/2,a[1]+tz*t+nz*.14,isFin?.16:.08,top-bottom,isFin?.45:.16,isFin?'metal':'mullion',angle);
    }
  }
  // Polygon follows a clockwise route when viewed in the local X/Z plane.
  const area=polygon.reduce((n,p,i)=>{const q=polygon[(i+1)%polygon.length];return n+p[0]*q[1]-q[0]*p[1];},0);
  polygon.forEach((a,i)=>{
    const b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1],span=Math.hypot(dx,dz);
    facade(a,b,0.5,24.8,5,'podium',area>0?[dz/span,-dx/span]:[-dz/span,dx/span]);
  });
  function tower(x,z,w,d,top,floors,mode) {
    const bottom=25.48;
    solid(x,z,w,d,bottom,top);
    facade([x,z],[x+w,z],bottom,top,floors,mode,[0,-1]);
    facade([x+w,z],[x+w,z+d],bottom,top,floors,mode,[1,0]);
    facade([x+w,z+d],[x,z+d],bottom,top,floors,mode,[0,1]);
    facade([x,z+d],[x,z],bottom,top,floors,mode,[-1,0]);
    solid(x+.15,z+.15,w-.3,d-.3,top,top+.05,'roof');
    // Equipment stays below the top+0.8 parapet datum.
    solid(x+w*.25,z+d*.28,w*.42,d*.36,top-.1,top+.65,'metal');
    for(const [rx,rz,rw,rd] of [[x,z,w,.18],[x,z+d-.18,w,.18],[x,z,.18,d],[x+w-.18,z,.18,d]]) solid(rx,rz,rw,rd,top,top+.8,'metal');
  }
  // Student residence has staggered wings and intermediate roof terraces.
  tower(5,9,width*.40,43,68.2,11,'student');
  tower(width*.50,17,width*.38,40,61.2,9,'student');
  tower(width*.38,18,width*.21,28,54.2,7,'student');
  // Slender faculty tower sits at Houston, with offset planes defining its notch.
  tower(width*.48,length-29,width*.24,26,90.2,18,'faculty');
  tower(width*.72,length-27,width*.20,24,88.2,18,'faculty');
  // Raised academic volume and several planted outdoor terraces.
  solid(3,63,width*.4,18,25.48,31,'glass');
  facade([3,63],[3+width*.4,63],25.48,31,1,'podium',[0,-1]);
  solid(3,63,width*.4,18,31,31.4,'roof');
  for(const [x,z,w,d] of [[2,2,width-4,2],[2,4,2,length-8],[4,length-4,width-8,2],[6,57,17,3],[5,84,16,3],[width-4,4,2,length-8]]) {
    solid(x,z,w,d,25.48,25.9,'metal'); solid(x+.15,z+.15,w-.3,d-.3,25.9,26.3,'planting');
  }
  // Glazed terrace rail and the long shallow entrance canopy visible in photos.
  for(const [x,z,w,d] of [[.6,.6,width-1.2,.10],[.6,length-.6,width-1.2,.10],[.6,.6,.10,length-1.2],[width-.6,.6,.10,length-1.2]]) solid(x,z,w,d,25.5,26.45,'metal');
  solid(width-2,12,1.9,length-24,3.9,4.15,'mullion');

  const root=new THREE.Group();
  root.name='Paulson Center — photo-informed architecture';
  root.userData.coordinateSpace='Washington Square map meters; geometry baked; identity root';
  root.userData.modelFidelity='Photo-informed approximation; not surveyed geometry';
  root.userData.architecture={studentHeight:69,facultyHeight:91,podiumHeight:25.48,reference:'docs/paulson-reference.md'};
  for(const [name,geometries] of Object.entries(batches)) {
    if(!geometries.length)continue;
    const geometry=mergeGeometries(geometries,false);
    if(!geometry)throw new Error(`Could not merge Paulson ${name} geometry`);
    geometry.applyMatrix4(frame); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometries.forEach(g=>g.dispose());
    const material=new THREE.MeshStandardMaterial({color:colors[name],roughness:name.startsWith('glass')?.38:.8,metalness:name.startsWith('glass')?.18:.05});
    const mesh=new THREE.Mesh(geometry,material); mesh.name=`Paulson ${name}`; root.add(mesh);
  }
  return root;
}
