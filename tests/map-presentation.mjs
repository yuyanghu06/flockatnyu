import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { validateCamera } from '../src/geometry.js';
import { createLandmarkEffects } from '../src/landmark-effects.js';
import { createMapAtmosphere,MAP_SKY_GLSL } from '../src/atmosphere.js';
let config=fs.readFileSync('src/config.js','utf8');
config=config.replace(/import (\w+) from '([^']+\.json)';/g,(_,name,path)=>`const ${name}=${fs.readFileSync(new URL(path,new URL('../src/config.js',import.meta.url)),'utf8')};`);
const {initialCamera,cameraLimits:L,palette,mapExtent,atmosphere}=await import('data:text/javascript;base64,'+Buffer.from(config).toString('base64'));
const results={checks:[],limitations:['No browser, network, server or build execution.','Shader string checks do not establish GPU compilation, visual appearance or draw-call performance.']};
const check=(name,fn)=>{fn();results.checks.push({name,pass:true});};
const near=(a,b,e=1e-8)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const offset=initialCamera.position.map((x,i)=>x-initialCamera.target[i]);
check('Sample polar limits and C distance; screenshot-directed initial target and azimuth',()=>{
 near(L.minPolarAngle,.00688542069);near(L.maxPolarAngle,.8434529930);near(L.maxDistance,434.2943200101);near(Math.hypot(...offset),L.maxDistance);
 assert.deepEqual(initialCamera.target,[74,12,116]);
 near(Math.atan2(offset[0],offset[2]),-172*Math.PI/180);
});
const pose=(distance,polar)=>({...initialCamera,position:[initialCamera.target[0]+distance*Math.sin(polar),initialCamera.target[1]+distance*Math.cos(polar),initialCamera.target[2]]});
check('Restore accepts exact bounds and rejects outside polar/distance/target',()=>{
 validateCamera(initialCamera,L);
 for(const d of [L.minDistance,L.maxDistance])for(const p of [L.minPolarAngle,L.maxPolarAngle])validateCamera(pose(d,p),L);
 for(const v of [pose(14,L.maxPolarAngle),pose(L.maxDistance+1,L.maxPolarAngle),pose(100,L.minPolarAngle-.001),pose(100,L.maxPolarAngle+.001),{...initialCamera,target:[999,12,0]}])assert.throws(()=>validateCamera(v,L));
});
check('Real OrbitControls update clamps both tilt bounds and maximum zoom distance',()=>{
 const camera=new T.PerspectiveCamera(),controls=new OrbitControls(camera,null);controls.target.fromArray(initialCamera.target);
 controls.minDistance=L.minDistance;controls.maxDistance=L.maxDistance;controls.minPolarAngle=L.minPolarAngle;controls.maxPolarAngle=L.maxPolarAngle;
 for(const [d,p] of [[800,1.4],[2,.0001],[L.maxDistance,L.maxPolarAngle]]){camera.position.fromArray(pose(d,p).position);controls.update();const v=camera.position.clone().sub(controls.target);near(v.length(),T.MathUtils.clamp(d,L.minDistance,L.maxDistance));near(Math.acos(v.y/v.length()),T.MathUtils.clamp(p,L.minPolarAngle,L.maxPolarAngle));validateCamera({...initialCamera,position:camera.position.toArray()},L);}
});
const scene=new T.Scene();let reduced=false;
const effects=createLandmarkEffects({scene,reducedMotion:()=>reduced});
const roots=Array.from({length:11},(_,i)=>{const root=new T.Group();root.position.set(i*10,3+i,4);root.rotation.y=.3;root.scale.set(1.2,1.5,.8);const nested=new T.Group();nested.position.set(2,1,-3);nested.rotation.z=.15;const m=new T.Mesh(new T.BoxGeometry(2,4,2),new T.MeshStandardMaterial({color:'#93784f',emissive:'#123456',emissiveIntensity:.3}));nested.add(m);root.add(nested);scene.add(root);effects.register(String(i),root);return {root,m,base:root.position.clone(),color:m.material.color.clone(),emissive:m.material.emissive.clone(),positions:Array.from(m.geometry.attributes.position.array)};});
const glows=()=>scene.children.filter(o=>o.userData.mapDecoration&&o.name.startsWith('Landmark glow '));
function aligned(i){scene.updateMatrixWorld(true);const r=roots[i],g=glows()[0].children[0];const positions=r.m.geometry.attributes.position,cloned=g.geometry.attributes.position;assert.equal(cloned,positions);for(let j=0;j<positions.count;j++){const a=new T.Vector3().fromBufferAttribute(positions,j).applyMatrix4(r.m.matrixWorld),b=new T.Vector3().fromBufferAttribute(cloned,j).applyMatrix4(g.matrixWorld);assert(a.distanceTo(b)<1e-5);}}
check('Lazy hovered-only overlay shares source geometry without registration copies',()=>{
 assert.equal(glows().length,0);for(let i=0;i<11;i++){effects.setActive(String(i),null);assert.equal(glows().length,1);const g=glows()[0];assert.equal(g.children.length,1);const surface=g.children[0],m=surface.material;assert.equal(surface.geometry,roots[i].m.geometry);assert(m.isMeshBasicMaterial);assert.equal(m.opacity,0);assert.equal(m.color.getHexString(),'ffffff');assert.equal(m.toneMapped,false);assert.equal(m.forceSinglePass,true);assert.equal(m.blending,T.AdditiveBlending);assert.equal(m.side,T.DoubleSide);assert.equal(m.depthWrite,false);assert(m.polygonOffset);assert.equal(m.polygonOffsetFactor,-1);assert.equal(m.polygonOffsetUnits,-1);assert.equal(surface.renderOrder,4);aligned(i);g.traverse(o=>{assert(o.userData.mapDecoration);const hits=[];o.raycast(new T.Raycaster(),hits);assert.equal(hits.length,0);});effects.setActive(null,null);for(let step=0;step<6;step++)effects.update(.05,0);assert.equal(glows().length,0);}effects.setActive(null,null);assert.equal(glows().length,0);
});
check('White hover fades in without moving any complete building root',()=>{
 effects.setActive('0',null);effects.update(999,0);for(const r of roots)assert(r.root.position.equals(r.base));
 for(let i=0;i<8;i++)effects.update(.05,0);const m=glows()[0].children[0].material;assert.equal(m.color.getHexString(),'ffffff');near(m.opacity,.18);aligned(0);
});
check('Selection retains the same white overlay through pointer leave with no pulse or reset',()=>{
 const overlay=glows()[0],material=overlay.children[0].material;effects.setActive('0','0');assert.equal(effects.snapshot().selectedId,'0');assert.equal(effects.snapshot().ringMeshes,2);assert.equal(effects.snapshot().outline.proxyCount,1);effects.setActive('0',null);assert.equal(effects.snapshot().selectedId,null);assert.equal(effects.snapshot().ringMeshes,0);assert.equal(effects.snapshot().outline.proxyCount,0);assert.equal(glows()[0],overlay);effects.setActive('0','0');effects.setActive(null,'0');assert.equal(glows()[0],overlay);near(material.opacity,.18);
 for(let i=0;i<100;i++)effects.update(.05,100);assert.equal(glows()[0],overlay);near(material.opacity,.18);assert.equal(material.color.getHexString(),'ffffff');for(const r of roots)assert(r.root.position.equals(r.base));
});
check('Selected building takes priority over another hover, then clear crossfades to that hover',()=>{
 effects.setActive('1','0');for(let i=0;i<8;i++)effects.update(.05,2.5);assert.equal(glows().length,1);assert.equal(glows()[0].name,'Landmark glow 0');
 effects.setActive('1',null);assert.equal(glows().length,2);assert.equal(glows().find(g=>g.name==='Landmark glow 1').children[0].material.opacity,0);for(let i=0;i<8;i++)effects.update(.05,2.5);assert.equal(glows().length,1);assert.equal(glows()[0].name,'Landmark glow 1');aligned(1);
});
check('Leave keeps outgoing view during280ms fade and fully idle clears views',()=>{
 const overlay=glows()[0],opacity=overlay.children[0].material.opacity;effects.setActive(null,null);assert.equal(glows()[0],overlay);near(overlay.children[0].material.opacity,opacity);for(let i=0;i<6;i++)effects.update(.05,2.5);assert.equal(glows().length,0);
});
check('Original root transforms, colors/emission and geometry stay untouched',()=>{
 for(const r of roots){assert(r.root.position.equals(r.base));assert(r.m.material.color.equals(r.color));assert(r.m.material.emissive.equals(r.emissive));assert.equal(r.m.material.emissiveIntensity,.3);assert.deepEqual(Array.from(r.m.geometry.attributes.position.array),r.positions);}
});
check('Reduced motion applies constant white immediately without lift; dispose removes views',()=>{
 reduced=true;effects.setActive('0',null);effects.update(0,1);near(glows()[0].children[0].material.opacity,.18);effects.update(.1,100);near(glows()[0].children[0].material.opacity,.18);for(const r of roots)assert(r.root.position.equals(r.base));
 effects.dispose();assert.equal(glows().length,0);for(const r of roots){assert(r.m.material.emissive.equals(r.emissive));assert.equal(r.m.material.emissiveIntensity,.3);}effects.dispose();
});
check('Analytic sky and geometry share exact world-ray GLSL/colorspace; one nonpickable sky triangle',()=>{
 const n=scene.children.length,mat=roots[0].m.material,base=mat.color.clone(),a=createMapAtmosphere(scene,palette,mapExtent,atmosphere);a.apply(scene);a.apply(scene);
 assert.equal(scene.children.length,n+1);assert(mat.color.equals(base));assert.equal(scene.background,null);assert.equal(a.sky.geometry.attributes.position.count,3);assert.equal(a.sky.material.depthWrite,false);assert.equal(a.sky.material.depthTest,false);assert.equal(a.sky.material.toneMapped,false);assert(a.sky.material.dithering&&mat.dithering);const hits=[];a.sky.raycast(new T.Raycaster(),hits);assert.equal(hits.length,0);
 const shader={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader,uniforms:{}};mat.onBeforeCompile(shader,{});
 assert(shader.vertexShader.includes('(modelMatrix * mapVertex).xyz'));assert(shader.vertexShader.includes('batchingMatrix * mapVertex'));assert(shader.vertexShader.includes('instanceMatrix * mapVertex'));assert(shader.fragmentShader.includes(MAP_SKY_GLSL));assert(a.sky.material.fragmentShader.includes(MAP_SKY_GLSL));assert.equal(shader.uniforms.mapSkyHorizon,a.sky.material.uniforms.mapSkyHorizon);assert.equal(shader.uniforms.mapSkyTop,a.sky.material.uniforms.mapSkyTop);
 assert(shader.fragmentShader.indexOf('#include <colorspace_fragment>')<shader.fragmentShader.indexOf('float mapBoundary'));assert(shader.fragmentShader.includes('vMapWorldPosition-cameraPosition'));assert(shader.fragmentShader.includes('1.0-(1.0-mapDistanceFog)*(1.0-edgeHaze)'));assert.equal(shader.uniforms.mapEdgeWidth.value,220);
});
check('Independent CPU rays give matching sky and full-fog colors across pitch/NDC; gradient continuous',()=>{
 const scene=new T.Scene(),a=createMapAtmosphere(scene,palette,mapExtent,atmosphere),camera=new T.PerspectiveCamera(43,1.6,.5,6000);let maxStep=0;
 const color=ray=>{const y=ray.clone().normalize().y,t=T.MathUtils.clamp((y+.12)/.92,0,1),blend=t*t*(3-2*t);return new T.Color(palette.skyHorizon).lerp(new T.Color(palette.skyTop),blend).convertLinearToSRGB();};
 for(const phi of [.0069,.84345,1.13446,1.36136]){camera.position.setFromSpherical(new T.Spherical(434,phi,-2.44));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);a.sky.onBeforeRender(null,scene,camera);assert.deepEqual(a.sky.material.uniforms.mapCameraWorld.value.elements,camera.matrixWorld.elements);
 for(const x of [-1,0,1])for(const y of [-1,0,1]){const cp=new T.Vector3(x,y,1).applyMatrix4(camera.projectionMatrixInverse),skyRay=cp.clone().transformDirection(camera.matrixWorld),world=new T.Vector3(x,y,.5).unproject(camera),fogRay=world.sub(camera.position).normalize();near(skyRay.distanceTo(fogRay),0);for(const channel of ['r','g','b'])near(color(skyRay)[channel],color(fogRay)[channel]);}}
 let prev=color(new T.Vector3(1,-.2,0));for(let i=1;i<=2000;i++){const y=-.2+i*1.2/2000,c=color(new T.Vector3(Math.sqrt(Math.max(0,1-y*y)),y,0));maxStep=Math.max(maxStep,Math.abs(c.r-prev.r),Math.abs(c.g-prev.g),Math.abs(c.b-prev.b));prev=c;}assert(maxStep<.001);assert(MAP_SKY_GLSL.includes('linearToOutputTexel'));assert(a.sky.material.fragmentShader.includes('#include <dithering_fragment>'));
});
const main=fs.readFileSync('src/main.js','utf8').replace(/\r\n/g,'\n'),css=fs.readFileSync('src/style.css','utf8'),html=fs.readFileSync('index.html','utf8');
check('Atmosphere preserves existing shader hooks/cache keys and skips decoration materials',()=>{
 const s=new T.Scene(),m=new T.MeshStandardMaterial();let calls=0;m.onBeforeCompile=shader=>{calls++;shader.uniforms.previous={value:7};};m.customProgramCacheKey=()=> 'prior-key';
 s.add(new T.Mesh(new T.BoxGeometry(),m));const decoration=new T.Mesh(new T.PlaneGeometry(),new T.MeshBasicMaterial());decoration.userData.mapDecoration=true;s.add(decoration);const hook=decoration.material.onBeforeCompile;
 const a=createMapAtmosphere(s,palette,mapExtent,atmosphere);a.apply(s);a.apply(s);const shader={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader,uniforms:{}};m.onBeforeCompile(shader,{});
 assert.equal(calls,1);assert.equal(shader.uniforms.previous.value,7);assert.equal(m.customProgramCacheKey(),'prior-key|map-ray-sky-v2');assert.equal(decoration.material.onBeforeCompile,hook);assert.equal((shader.vertexShader.match(/vMapWorldPosition =/g)||[]).length,1);
});
check('Reference-aspect composition keeps park foreground, arch below fountain and campus facades arranged',()=>{
 const camera=new T.PerspectiveCamera(initialCamera.fov,1606/869,initialCamera.near,initialCamera.far);camera.position.fromArray(initialCamera.position);camera.lookAt(new T.Vector3(...initialCamera.target));camera.updateMatrixWorld(true);
 const points={fountain:[-10,1,0],arch:[19,10,-46],bobst:[9.692,28.23,154.508],silver:[146,29,53],kimmel:[-48,27,117]};const screen=Object.fromEntries(Object.entries(points).map(([id,xyz])=>{const p=new T.Vector3(...xyz).project(camera);return [id,[(p.x+1)/2,(1-p.y)/2]];}));
 for(const p of Object.values(screen))assert(p.every(n=>n>0&&n<1));assert(screen.fountain[1]>.7);assert(screen.arch[1]>screen.fountain[1]);assert(screen.bobst[1]<screen.fountain[1]);assert(screen.silver[0]<screen.fountain[0]&&screen.kimmel[0]>screen.fountain[0]);results.composition=screen;
 const reset=main.slice(main.indexOf('function resetView()'),main.indexOf("$('reset').addEventListener"));assert(reset.includes('select(null)'));assert(reset.includes('setHovered(null)'));assert(reset.includes('restoreCamera(initialCamera)'));assert(main.includes('selected: null, hovered: null'));
});
check('Static map-only UI, neutral context and complete-root effect integration',()=>{
 assert(html.includes('<body class="map-only">'));assert(css.includes('.map-only #app > :not(#map){display:none!important}'));assert(html.includes('<div id="hover"'));
 assert(main.includes('color: palette.context, vertexColors: false'));assert(/^#[a-f0-9]{6}$/i.test(palette.context));
 assert(main.includes('if (job.tile) {\n      model.traverse(mesh => { if (mesh.isMesh) mesh.material = cityMaterial; });'));assert.equal((main.match(/mesh.material = cityMaterial/g)||[]).length,2);
 assert(/landmarkEffects\.register\(id,\s*model(?:,|\))/.test(main));assert(main.includes('landmarkEffects.setActive(state.hovered,state.selected)'));assert(main.includes('landmarkEffects.update('));
 for(const key of ['maxDistance','minPolarAngle','maxPolarAngle'])assert(main.includes(`controls.${key} = cameraLimits.${key}`));
});
check('Both restored Union Square context assets and Lipton use neutral context, without new selectable IDs',()=>{
 const assets=fs.readFileSync('src/assets.js','utf8');for(const id of ['25-union-square-west','235-park-avenue-south']){assert(assets.includes(id+'.glb'));assert(!config.includes("id: '"+id+"'"));}
 assert(main.includes("['lipton-hall','25-union-square-west','235-park-avenue-south'].includes(job.name)"));const block=main.slice(main.indexOf("if (['lipton-hall'"),main.indexOf("if (['lipton-hall'")+450);assert(block.includes('mesh.material = cityMaterial'));
});
results.camera={minPolar:L.minPolarAngle,maxPolar:L.maxPolarAngle,maxDistance:L.maxDistance};
const evidence=process.env.MAP_EVIDENCE??'evidence/m12-memory';fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(evidence+'/presentation-results.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
