import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { insideFootprint } from './geometry.js';

// South corner tower of BIN1008629 (250 Mercer / 683 Broadway). The northern
// tower and low adjoining podium remain ordinary context; never replace the lot.
export const broadway683Replacement = {
  tile: 'tile-1_1.glb', sourceBin: '1008629',
  footprint: [[197.257,295.714],[218.816,309.494],[214.773,315.818],[214.635,316.035],[210.817,322.008],[210.503,322.499],[210.191,322.299],[197.801,314.38],[189.285,308.936],[185.837,306.732],[186.271,306.053],[188.592,302.421],[190.317,299.722],[193.296,301.627],[193.43,301.702]],
  datasetHeightRange: [4.148,59.608],
};

/** Preserve every extracted source face, then bake all decorative geometry into
 * one vertex-colored mesh. World/map coordinates and identity root are required
 * by picking, the selection outline, footprint and fixed camera framing.
 */
export function createBroadway683Model(tileRoot) {
  tileRoot.updateMatrixWorld(true);
  const triangles=[];
  tileRoot.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const position=mesh.geometry.getAttribute('position'),index=mesh.geometry.getIndex();
    for(let i=0;i<(index?index.count:position.count);i+=3) {
      const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(position,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
      if(points.every(p=>insideFootprint(p.x,p.z,broadway683Replacement.footprint)&&p.y>=4.048&&p.y<=59.708))triangles.push(points);
    }
  });
  // Fail before mutating the source if a future asset changes the contract.
  if(triangles.length!==70)throw new Error(`683 Broadway requires 70 source triangles; found ${triangles.length}.`);
  const palette={brick:'#965d52',brickLight:'#a86d60',stone:'#d6cbb7',stoneShade:'#b8af9e',glass:'#344345',frame:'#343732',sill:'#dcd1ba',roof:'#656862',metal:'#747975',tank:'#989485',lid:'#c7ac80',earth:'#68644c',leaf:'#688052',leafLight:'#8a9864',trunk:'#75634a',paving:'#c5bcaa'};
  const colors=Object.fromEntries(Object.entries(palette).map(([k,v])=>[k,new THREE.Color(v)]));
  const pieces=[];
  function add(geometry,key) {
    const plain=geometry.index?geometry.toNonIndexed():geometry;
    if(plain!==geometry)geometry.dispose();
    for(const name of Object.keys(plain.attributes))if(name!=='position'&&name!=='normal')plain.deleteAttribute(name);
    const color=colors[key],array=new Float32Array(plain.attributes.position.count*3);
    for(let i=0;i<array.length;i+=3){array[i]=color.r;array[i+1]=color.g;array[i+2]=color.b;}
    plain.setAttribute('color',new THREE.BufferAttribute(array,3));pieces.push(plain);
  }
  function box(x,y,z,w,h,d,key,angle=0) {
    const geometry=new THREE.BoxGeometry(w,h,d);geometry.rotateY(angle);geometry.translate(x,y,z);add(geometry,key);
  }
  function cylinder(x,y,z,rt,rb,h,key,segments=20) {
    const geometry=new THREE.CylinderGeometry(rt,rb,h,segments);geometry.translate(x,y,z);add(geometry,key);
  }
  const axes=[new THREE.Vector3(-.539,0,.843),new THREE.Vector3(.843,0,.539),new THREE.Vector3(.539,0,-.843),new THREE.Vector3(-.843,0,-.539)].map(v=>v.normalize());
  const faceGroups=new Map();
  for(const points of triangles) {
    const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));geometry.computeVertexNormals();
    // Selected shell is the first70triangles, including selected ground faces.
    // Six cross-boundary shared ground triangles stay in the source tile.
    // No cleanup can silently delete one of the selected original surfaces.
    add(geometry,Math.abs(normal.y)>.8?'roof':'brick');
    if(Math.abs(normal.y)>.1)continue;
    const plan=[...new Map(points.map(p=>[`${p.x.toFixed(2)},${p.z.toFixed(2)}`,p])).values()];
    if(plan.length!==2)continue;
    const axis=axes.findIndex(v=>v.dot(normal)>.99);if(axis<0)continue;
    const n=axes[axis],tx=n.z,tz=-n.x,plane=(n.x*plan[0].x+n.z*plan[0].z);
    const lo=Math.min(...points.map(p=>p.y)),hi=Math.max(...points.map(p=>p.y));
    // Coplanar CityGML faces are split by roof enclosures. Merge their facade
    // intervals only for detail layout, preserving the untouched source shell.
    const key=`${axis}/${Math.round(plane*4)}/${Math.round(lo)}`;
    const a=Math.min(...plan.map(p=>p.x*tx+p.z*tz)),b=Math.max(...plan.map(p=>p.x*tx+p.z*tz));
    const group=faceGroups.get(key);
    if(group){group.a=Math.min(group.a,a);group.b=Math.max(group.b,b);group.hi=Math.max(group.hi,hi);}
    else faceGroups.set(key,{axis,n,tx,tz,plane,a,b,lo,hi});
  }
  let windowCount=0,storefrontCount=0,corniceSegments=0;
  for(const {axis,n,tx,tz,plane,a,b,lo,hi} of faceGroups.values()) {
    const span=b-a;if(span<1.1)continue;
    const angle=-Math.atan2(tz,tx),publicFace=axis<2;
    function face(t,y,w,h,d,key,offset=.035) {
      const outward=plane+d/2+offset;
      box(tx*(a+t)+n.x*outward,y,tz*(a+t)+n.z*outward,w,h,d,key,angle);
    }
    if(lo>55) {
      face(span/2,(lo+hi)/2,span,hi-lo,.10,'roof');
      face(span/2,hi+.08,span+.15,.16,.27,'metal');
      if(span>4)for(let t=1;t<span-1;t+=1.3){face(t,lo+1.5,.85,1.2,.13,'frame',.1);for(let y=lo+1.05;y<lo+2;y+=.2)face(t,y,.8,.035,.19,'metal',.12);}
      continue;
    }
    const top=Math.min(hi,56.28),baseTop=16.75;
    const bays=Math.max(1,Math.round(span/(publicFace?2.85:3.35))),pitch=span/bays;
    if(publicFace&&lo<10) {
      const bottom=Math.max(lo,4.15);
      face(span/2,(bottom+baseTop)/2,span,baseTop-bottom,.12,'stone');
      // Horizontal joints and alternating corner blocks reproduce the pale,
      // rusticated three-storey base without per-brick geometry.
      for(let y=bottom+.65;y<baseTop;y+=.62)face(span/2,y,span,.035,.15,'stoneShade',.11);
      for(let row=0;row<12;row++)for(const t of [.48,span-.48]) {
        const y=17.5+row*3.05;if(y>top-.6)continue;
        face(t,y,1.0,.64,.26,'stone',.06);face(t,y+.68,.78,.58,.21,'stone',.06);
      }
      for(const [y,h,d]of[[4.42,.35,.26],[16.73,.38,.35],[17.07,.16,.47],[45.98,.25,.24],[51.95,.21,.23]])if(y>lo&&y<top)face(span/2,y,span+.12,h,d,'sill');
    }
    for(let row=0;row<13;row++) {
      const y=6.75+row*3.94,h=row<3?2.75:2.5;
      if(row===0&&publicFace&&lo<5)continue;
      if(y-h/2<lo+.22||y+h/2>top-.6)continue;
      for(let col=0;col<bays;col++) {
        const t=(col+.5)*pitch,w=Math.min(publicFace?1.25:1.12,pitch-.82);
        if(w<.55)continue;
        // Broad stone surround, dark reveal, two sash panes, meeting rail and
        // slender central mullion. A few deterministic muted panes add depth.
        face(t,y,w+.24,h+.22,.12,row<3?'stoneShade':'stone');
        face(t,y,w+.08,h+.06,.16,'frame',.12);
        face(t,y,w,h-.09,.18,'glass',.14);
        face(t,y-.04,w,.065,.22,'stoneShade',.14);
        face(t,y,.045,h-.08,.22,'frame',.14);
        face(t,y-h/2-.12,w+.36,.16,.36,'sill',.06);
        if(publicFace&&row>2)face(t,y+h/2+.10,w+.33,.15,.27,'sill',.05);
        if(publicFace&&row>3&&(row+col*7)%19===0)face(t,y-h*.29,w*.7,.35,.5,'metal',.21);
        windowCount++;
      }
    }
    if(publicFace&&lo<5) {
      for(let col=0;col<bays;col++) {
        // Ground entrance/glazing is deliberately generic: no invented tenant
        // signs or lettering are copied from map labels in the user image.
        const t=(col+.5)*pitch;
        face(t,6.5,Math.min(1.55,pitch-.5),3.8,.20,'frame',.16);
        face(t,6.52,Math.min(1.36,pitch-.7),3.55,.24,'glass',.17);
        face(t,6.5,.065,3.6,.28,'stoneShade',.17);storefrontCount++;
      }
    }
    if(top>55) {
      // Deep layered crown, modillions and narrow attic bands are prominent
      // from the reference's elevated camera.
      for(const[y,h,d,key]of[[54.62,.20,.31,'stone'],[55.04,.26,.43,'stoneShade'],[55.39,.15,.67,'sill'],[55.77,.33,.52,'stone'],[56.13,.23,.79,'sill']])face(span/2,y,span+.24,h,d,key);
      if(publicFace)for(let t=.4;t<span-.2;t+=.74)face(t,55.11,.24,.37,.57,'stone');
      // Roof parapet sits inside the footprint, capped pale to frame the garden.
      face(span/2,56.67,span,.68,.25,'brickLight',-.29);
      face(span/2,57.06,span+.08,.12,.37,'sill',-.29);corniceSegments++;
    }
    if(hi>58) {
      face(span/2,57.9,span,3.12,.09,'roof',-.06);
      face(span/2,hi+.08,span+.12,.16,.26,'metal');
    }
  }
  // Roof coordinates in the street-aligned frame: u runs east along W3rd,
  // v north from the street. Exact wall/bulkhead shell remains source-derived.
  const origin=[185.833,306.724],east=[.843,.539],north=[.539,-.843];
  const roofY=56.30,roofAngle=-Math.atan2(east[1],east[0]);
  function roofBox(u,v,y,w,h,d,key) {box(origin[0]+east[0]*u+north[0]*v,y,origin[1]+east[1]*u+north[1]*v,w,h,d,key,roofAngle);}
  function roofCylinder(u,v,y,rt,rb,h,key,segments=20) {cylinder(origin[0]+east[0]*u+north[0]*v,y,origin[1]+east[1]*u+north[1]*v,rt,rb,h,key,segments);}
  // Raised beds follow the long south/east roof perimeter; shrubs and eight
  // small trees occupy beds, leaving a paved, legible circulation route.
  const beds=[[17.1,1.45,5.2,1.25],[23.4,1.45,4.4,1.25],[26.5,4.2,1.25,4.1],[26.5,10.2,1.25,4.4],[19.6,13.0,6.0,1.3],[15.5,10.6,1.5,3.5],[15.1,5.3,1.6,1.25]];
  let shrubCount=0;
  beds.forEach(([u,v,w,d],i)=>{
    roofBox(u,v,roofY+.26,w,.5,d,'stoneShade');roofBox(u,v,roofY+.53,w-.16,.08,d-.16,'earth');
    const count=Math.max(2,Math.round(Math.max(w,d)/.8));
    for(let j=0;j<count;j++) {
      const du=w>d?(j+.5-count/2)*w/count:0,dv=d>w?(j+.5-count/2)*d/count:0;
      roofCylinder(u+du,v+dv,roofY+.9,.36,.44,.7,(i+j)%2?'leaf':'leafLight',7);shrubCount++;
    }
  });
  for(const [u,v]of[[15.1,5.3],[15.1,1.45],[18.7,1.45],[23.7,1.45],[26.5,4.5],[26.5,10.9],[20,13],[15.5,11.1]]) {
    roofCylinder(u,v,roofY+1.4,.09,.13,1.8,'trunk',7);
    const geometry=new THREE.IcosahedronGeometry(.88,1);geometry.scale(1,1.35,1);geometry.translate(origin[0]+east[0]*u+north[0]*v,roofY+2.45,origin[1]+east[1]*u+north[1]*v);add(geometry,'leaf');
  }
  // Individual paving slabs are flat and remain within the open roof terrace.
  let pavingCount=0;
  for(let u=16;u<26;u+=1.35)for(let v=3.3;v<12.2;v+=1.35) {
    if(Math.hypot(u-18.2,v-5.6)<3.0||u<17&&v>8)continue;
    roofBox(u,v,roofY+.045,1.24,.08,1.24,'paving');pavingCount++;
  }
  // Cylindrical New York water tank: support legs, broad weathered staves,
  // narrow dark hoops, overhanging tan lid and small vent. It is an approximation
  // from the single supplied image, never a surveyed rooftop structure.
  const tankU=18.2,tankV=5.6;
  for(const [du,dv]of[[-1.05,-1.05],[-1.05,1.05],[1.05,-1.05],[1.05,1.05]])roofBox(tankU+du,tankV+dv,roofY+.8,.16,1.55,.16,'metal');
  roofBox(tankU,tankV,roofY+1.36,3.0,.20,3.0,'metal');
  roofCylinder(tankU,tankV,roofY+3.0,1.8,1.8,3.1,'tank',32);
  for(let y=roofY+1.62;y<roofY+4.5;y+=.48)roofCylinder(tankU,tankV,y,1.825,1.825,.065,'metal',32);
  for(let i=0;i<24;i++) {
    const theta=i*Math.PI*2/24;
    roofBox(tankU+1.805*Math.cos(theta),tankV+1.805*Math.sin(theta),roofY+3,.035,2.95,.035,'stoneShade');
  }
  roofCylinder(tankU,tankV,roofY+4.62,1.94,1.94,.20,'lid',32);
  roofCylinder(tankU,tankV,roofY+4.82,.12,1.9,.25,'lid',32);
  roofCylinder(tankU,tankV,roofY+5.02,.12,.12,.25,'metal',12);
  // Small roof vent housings near retained source bulkheads.
  for(const [u,v]of[[8,9],[11.2,10.2]]){roofBox(u,v,59.67,1.0,.32,.9,'metal');roofBox(u,v,59.9,1.16,.12,1.02,'roof');}
  const geometry=mergeGeometries(pieces,false);pieces.forEach(piece=>piece.dispose());
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,color:0xffffff,roughness:.9,side:THREE.DoubleSide}));
  mesh.name='Go Greek — 683 Broadway south corner tower';
  mesh.userData={buildingId:'683-broadway',sourceBin:'1008629',sourceTriangles:triangles.length,windowCount,storefrontCount,corniceSegments,roofDetails:{planters:beds.length,trees:8,shrubs:shrubCount,pavingSlabs:pavingCount,waterTanks:1,sourceBulkheads:true},modelFidelity:'Original CityGML south-tower shell; single-image-informed facade and rooftop approximation',coordinateSpace:'Baked Washington Square map meters; identity root',triangles:geometry.attributes.position.count/3};
  return mesh;
}
