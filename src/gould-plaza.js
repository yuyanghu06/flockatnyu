import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Photo-informed permanent plaza layout, not a survey or a 2026 renovation model.
// Replaces the entire exported Gould GLB. Identity root, Washington Square meters.
// Reference derivation and dated photographs: docs/gould-plaza-reference.md.
export function createGouldPlaza() {
  const origin = new THREE.Vector3(98.137, 0, 174.033);
  const east = new THREE.Vector3(0.84055, 0, 0.54173).normalize();
  const south = new THREE.Vector3(-east.z, 0, east.x);
  const frame = new THREE.Matrix4().makeBasis(east, new THREE.Vector3(0, 1, 0), south);
  frame.setPosition(origin);
  // The old slab occupied only 22 x 22m. Building footprints define this court:
  // Stern/KMC west (including rotunda), Tisch south, Warren Weaver/Courant east.
  const westCurve = [[0,13.67],[0.75,13.69],[1.5,13.77],[2.24,13.91],[2.96,14.11],[3.66,14.37],[4.34,14.69],[4.99,15.07],[5.61,15.5],[6.19,15.98],[6.73,16.5],[7.22,17.07],[7.66,17.68],[8.05,18.32],[8.38,19],[8.66,19.7],[8.87,20.41],[9.03,21.15],[9.13,21.89],[9.16,22.65],[9.12,23.4],[9.03,24.14],[8.87,24.88],[8.66,25.6],[8.38,26.29],[8.05,26.97],[7.66,27.61],[7.22,28.22],[6.73,28.79],[6.19,29.31],[5.61,29.79],[4.99,30.22],[4.34,30.6],[3.66,30.92],[2.96,31.18],[2.24,31.38],[1.5,31.52],[0.75,31.6],[0,31.62]];
  const outline = [[0.3,0],[58.7,0],[58.7,62.3],[49.6,62.3],[49.6,36.8],[0.3,36.8],[0.3,32.0],...westCurve.slice().reverse().map(([x,z])=>[x+0.3,z]),[0.3,13.2]];
  const colors = { base:'#9b968a', paving:'#bcb8aa', light:'#d3d1c3', red:'#987261', glass:'#789c98', frame:'#58645f', wood:'#756955', metal:'#6b7370', soil:'#514837', leaf:'#68844e', leafLight:'#8da36a' };
  const batches = Object.fromEntries(Object.keys(colors).map(key => [key, []]));
  const elevation = x => 2.93 + x / 60 * (3.752 - 2.89);
  function inside(x,z) {
    let result=false;
    for(let i=0,j=outline.length-1;i<outline.length;j=i++) {
      const [a,b]=outline[i],[c,d]=outline[j];
      if((b>z)!==(d>z) && x < (c-a)*(z-b)/(d-b)+a) result=!result;
    }
    return result;
  }
  function add(geometry, material, relative = true) {
    let plain = geometry.index ? geometry.toNonIndexed() : geometry;
    if(plain!==geometry) geometry.dispose();
    plain.deleteAttribute('uv');
    const positions=plain.getAttribute('position');
    if(relative) for(let i=0;i<positions.count;i++) positions.setY(i,positions.getY(i)+elevation(positions.getX(i)));
    plain.computeVertexNormals();
    plain.applyMatrix4(frame);
    batches[material].push(plain);
  }
  function box(x,z,w,d,bottom,top,material) {
    const geometry=new THREE.BoxGeometry(w,top-bottom,d);
    geometry.translate(x+w/2,(bottom+top)/2,z+d/2);
    add(geometry,material);
  }
  function surface(x,z,w,d,height,material) {
    const geometry=new THREE.PlaneGeometry(w,d);
    geometry.rotateX(-Math.PI/2);
    geometry.translate(x+w/2,height,z+d/2);
    add(geometry,material);
  }
  function groundedBox(x,z,w,d,top,material) {
    const geometry=new THREE.BoxGeometry(w,1,d);
    geometry.translate(x+w/2,0,z+d/2);
    const positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++) positions.setY(i,positions.getY(i)<0?-.12:elevation(positions.getX(i))+top);
    add(geometry,material,false);
  }
  function rod(a,b,radius,material='metal') {
    const from=new THREE.Vector3(a[0],a[1],a[2]);
    const to=new THREE.Vector3(b[0],b[1],b[2]);
    const delta=to.clone().sub(from);
    const geometry=new THREE.CylinderGeometry(radius,radius,delta.length(),8);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
    geometry.translate(...from.add(to).multiplyScalar(.5).toArray());
    add(geometry,material);
  }
  const shape=new THREE.Shape(outline.map(([x,z])=>new THREE.Vector2(x,-z)));
  const slab=new THREE.ExtrudeGeometry(shape,{depth:1,steps:1,bevelEnabled:false});
  slab.rotateX(-Math.PI/2);
  // Keep the foundation grounded while meeting the measured building datums.
  const pos=slab.attributes.position;
  for(let i=0;i<pos.count;i++) pos.setY(i,pos.getY(i)<.5 ? -.12 : elevation(pos.getX(i)));
  add(slab,'base',false);

  const skylights = [{x:29,z:9,w:10.6,d:8.4},{x:42,z:9,w:10.6,d:8.4}];
  let pavers=0;
  // Small concrete squares and pale crossing bands with red granite junctions,
  // as seen in NYU's pre-renovation photographs. No photographic texture is used.
  const pitch=.56;
  for(let col=0;col<105;col++) for(let row=0;row<112;row++) {
    const x=.32+col*pitch,z=.02+row*pitch;
    const w=pitch-.025,d=pitch-.025;
    if(![[x,z],[x+w,z],[x,z+d],[x+w,z+d]].every(([a,b])=>inside(a,b))) continue;
    const cx=x+w/2,cz=z+d/2;
    if(skylights.some(s=>cx>s.x-.1&&cx<s.x+s.w+.1&&cz>s.z-.1&&cz<s.z+s.d+.1)) continue;
    const bandX=col%10===0;
    const bandZ=row%10===0;
    surface(x,z,w,d,.015,bandX&&bandZ?'red':bandX||bandZ?'light':'paving');pavers++;
  }
  for(const s of skylights) {
    box(s.x-.09,s.z-.09,s.w+.18,s.d+.18,.012,.045,'frame');
    const columns=8,rows=7;
    for(let i=0;i<columns;i++) for(let j=0;j<rows;j++) surface(s.x+i*s.w/columns+.035,s.z+j*s.d/rows+.035,s.w/columns-.07,s.d/rows-.07,.055,'glass');
  }
  // The six front risers and red stone cheek walls are visible in the official
  // admissions photograph. They remain within the plaza frontage, not a road.
  for(let step=0;step<6;step++) groundedBox(6,-2.7+step*.45,47,(6-step)*.45,-.90+step*.18,'light');
  // Datum reconciliation, not a photographed feature: the exported scene has
  // flat ground roughly 2m below the real surrounding sidewalk. A lower flight
  // connects that ground to the six reference risers without a vertical curb.
  for(let step=0;step<14;step++) {
    const geometry=new THREE.BoxGeometry(47,1,(14-step)*.28);
    geometry.translate(29.5,0,-6.62+step*.28+(14-step)*.14);
    const positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++) {
      const top=-.12+(elevation(positions.getX(i))-.90+.12)*(step+1)/15;
      positions.setY(i,positions.getY(i)<0?-.12:top);
    }
    add(geometry,'light',false);
  }
  for(const [x,w] of [[.4,5.3],[53.35,5.05]]) {
    groundedBox(x,-2.7,w,2.8,.75,'red');
    box(x-.03,-2.73,w+.06,2.86,.75,.83,'red');
  }
  for(const x of [6.2,29.5,52.8]) {
    for(const z of [-2.5,-1.3,-.1]) {
      const bottom= -.90+Math.floor((z+2.7)/.45)*.18;
      rod([x,bottom,z],[x,bottom+.95,z],.045);
    }
    rod([x,.01,-2.6],[x,.91,0],.055);
  }
  // Eight slatted benches form the seating zone beside Tisch Hall; circulation
  // remains open between both Stern entrances, the skylights and Courant.
  const benches=[[23,29],[28,29],[33,29],[38,29],[23,33],[28,33],[33,33],[38,33]];
  for(const [x,z] of benches) {
    for(const legX of [x+.25,x+2.05]) {
      box(legX,z+.06,.10,.48,0,.47,'metal');
      box(legX,z+.50,.10,.08,.38,.98,'metal');
    }
    for(let i=0;i<5;i++) box(x,z+i*.10,2.4,.08,.45,.52,'wood');
    for(let i=0;i<4;i++) box(x,z+.53,2.4,.07,.61+i*.105,.685+i*.105,'wood');
  }
  // Memorial roundel in the paving, represented without invented inscription.
  const medallion=new THREE.CylinderGeometry(1.25,1.25,.025,48);
  medallion.translate(19,.03,21);add(medallion,'red');
  for(const [x,z] of [[13,13],[17,29],[44,28],[55,21]]) {
    const bin=new THREE.CylinderGeometry(.22,.22,.82,12);bin.translate(x,.41,z);add(bin,'metal');
  }
  // User-requested planting proposal. Edge planters leave the skylights,
  // rotunda, central court and both building approaches clear.
  const trees=[[15,5],[15,24],[46,25],[54.5,30]];
  for(const [x,z] of trees) {
    box(x-1.05,z-1.05,2.1,2.1,.025,.58,'base');
    box(x-.90,z-.90,1.8,1.8,.58,.61,'soil');
    const trunk=new THREE.CylinderGeometry(.11,.18,3.9,7);
    trunk.translate(x,2.55,z);add(trunk,'wood');
    for(const [dx,dy,dz,s] of [[0,4.85,0,1.7],[-.75,4.3,.2,1.2],[.8,4.4,-.25,1.3]]) {
      const crown=new THREE.IcosahedronGeometry(s,1);crown.scale(1,1.13,1);
      crown.translate(x+dx,dy,z+dz);add(crown,dx>0?'leafLight':'leaf');
    }
  }
  const planters=[[20,34.5,5,1],[42,32,4,1],[54,19,1,4]];
  for(const [x,z,w,d] of planters) {
    box(x,z,w,d,.025,.48,'base');box(x+.12,z+.12,w-.24,d-.24,.48,.50,'soil');
    for(let i=0;i<5;i++) {
      const shrub=new THREE.IcosahedronGeometry(.46,1);shrub.scale(1,.85,1);
      shrub.translate(x+(w>d?w*(i+.5)/5:w/2),.85,z+(d>w?d*(i+.5)/5:d/2));add(shrub,i%2?'leaf':'leafLight');
    }
  }
  const group=new THREE.Group();group.name='Gould Plaza';
  for(const [key,geometries] of Object.entries(batches)) {
    if(!geometries.length) continue;
    const merged=mergeGeometries(geometries,false);
    geometries.forEach(g=>g.dispose());
    const material=new THREE.MeshStandardMaterial({color:colors[key],roughness:key==='glass'?.28:key==='metal'?.52:.92,metalness:key==='metal'?.35:0,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(merged,material);mesh.name=`Gould Plaza ${key}`;group.add(mesh);
  }
  group.userData={coordinateSpace:'Washington Square map meters; identity transform',modelFidelity:'Photo-informed pre-renovation permanent plaza layout; not a survey of current access or 2026 works.',architecture:{pavers,skylights:2,benches:benches.length,frontSteps:6,mainCourtMeters:[58.7,36.8],reference:'docs/gould-plaza-reference.md'}};
  group.userData.planting={trees:trees.length,shrubPlanters:planters.length,provenance:'User-requested planting proposal, not surveyed existing vegetation'};
  return group;
}
