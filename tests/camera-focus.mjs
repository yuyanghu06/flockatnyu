import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildingViews,buildingFocusPolarAngle,buildingFocusedMaxPolarAngle } from '../src/building-views.js';
import { createCameraFocus } from '../src/camera-focus.js';
import { constrainPan,validateCamera } from '../src/geometry.js';
let source=fs.readFileSync('src/config.js','utf8');source=source.replace(/import (\w+) from '([^']+\.json)';/g,(_,name,path)=>`const ${name}=${fs.readFileSync(new URL(path,new URL('../src/config.js',import.meta.url)),'utf8')};`);
const {initialCamera,cameraLimits:limits}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const result={checks:[],limitations:['Node numerical tests, no browser input or GPU validation.','Oversized targets cannot fit fully when configured maximum distance is reached.']};
const check=(name,fn)=>{fn();result.checks.push({name,pass:true});};
const near=(a,b,e=1e-7)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
function rig(aspect=1.6,reducedMotion=false){const camera=new T.PerspectiveCamera(43,aspect,.5,6000);camera.position.fromArray(initialCamera.position);const controls=new OrbitControls(camera,null);controls.target.fromArray(initialCamera.target);Object.assign(controls,{enableDamping:true,minDistance:limits.minDistance,maxDistance:limits.maxDistance,minPolarAngle:limits.minPolarAngle,maxPolarAngle:limits.maxPolarAngle});controls.update();return {camera,controls,focus:createCameraFocus({camera,controls,limits,constrainPan,reducedMotion})};}
function model(x=40,z=100,w=20,h=30,d=15){const root=new T.Group(),child=new T.Group();root.position.set(x,4.5,z);child.position.y=h/2;child.add(new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshBasicMaterial()));root.add(child);return root;}
function validate(r){validateCamera({...initialCamera,position:r.camera.position.toArray(),target:r.controls.target.toArray()},{...limits,maxPolarAngle:r.controls.maxPolarAngle});}
function done(r){for(let i=0;i<200;i++){r.focus.update(.02);validate(r);}assert.equal(r.focus.active,false);assert.equal(r.controls.enableDamping,true);}
function pose(r){return [...r.camera.position.toArray(),...r.controls.target.toArray()];}
check('Immediate transition activation, smooth pan and zoom, all intermediate constraints and default front tilt',()=>{
 const r=rig(),root=model(),start=pose(r),az=r.controls.getAzimuthalAngle();assert(r.focus.focus(root));assert(r.focus.active);assert.equal(r.controls.enableDamping,false);pose(r).forEach((v,i)=>near(v,start[i]));r.focus.update(.1);assert.notDeepEqual(pose(r),start);validate(r);done(r);near(r.controls.getPolarAngle(),buildingFocusPolarAngle);near(r.controls.target.x,40);near(r.controls.target.z,100);near(r.controls.target.y,19.5);
});
check('Complete transformed bounds plus lift margin fit landscape and portrait without capped distance',()=>{
 let landscapeDistance;
 for(const aspect of [1.8,.5]){const r=rig(aspect),root=model(30,90,18,25,12);root.rotation.y=.6;assert(r.focus.focus(root));done(r);r.camera.updateMatrixWorld(true);r.camera.updateProjectionMatrix();const box=new T.Box3().setFromObject(root);box.min.y-=4.5;box.max.y+=4.5;
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new T.Vector3(x,y,z).project(r.camera);assert(Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z>-1&&p.z<1);}
 const distance=r.camera.position.distanceTo(r.controls.target);if(aspect>1)landscapeDistance=distance;else assert(distance>landscapeDistance);}
});
check('Rapid retarget begins from current pose; cancellation freezes transition and restores damping',()=>{
 const r=rig();r.focus.focus(model());r.focus.update(.2);const middle=pose(r);assert(r.focus.focus(model(-100,-120)));pose(r).forEach((v,i)=>near(v,middle[i]));r.focus.update(.1);validate(r);r.focus.cancel();const stopped=pose(r);assert.equal(r.focus.active,false);assert.equal(r.controls.enableDamping,true);assert.equal(r.focus.update(1),false);pose(r).forEach((v,i)=>near(v,stopped[i]));
});
check('Invalid empty root and invalid delta preserve pose; invalid focus preserves existing transition',()=>{
 const r=rig(),start=pose(r);assert.equal(r.focus.focus(new T.Group()),false);pose(r).forEach((v,i)=>near(v,start[i]));assert.equal(r.controls.enableDamping,true);r.focus.focus(model());const activePose=pose(r);assert.equal(r.focus.focus(null),false);assert(r.focus.active);r.focus.update(NaN);r.focus.update(-1);pose(r).forEach((v,i)=>near(v,activePose[i]));done(r);
});
check('Maximum distance and map target clamps, minimum-distance tiny target, original damping false restored',()=>{
 const r=rig(.3);r.focus.focus(model(1200,1400,300,220,300));done(r);near(r.camera.position.distanceTo(r.controls.target),limits.maxDistance);near(r.controls.target.x,limits.targetBounds.maxX);near(r.controls.target.z,limits.targetBounds.maxZ);
 const small=rig(2);small.controls.enableDamping=false;small.focus.focus(model(0,0,.001,.001,.001));small.focus.update(10);assert.equal(small.controls.enableDamping,false);validate(small);assert(small.camera.position.distanceTo(small.controls.target)>=limits.minDistance-1e-8);
});
check('All ten configured front orientations finish at requested angle after spring settling',()=>{
 assert.equal(Object.keys(buildingViews).length,10);
 for(const [id,view] of Object.entries(buildingViews)){const r=rig();r.focus.focus(model(),id);r.focus.update(.1);assert(r.focus.active);r.focus.update(10);assert.equal(r.focus.active,false);assert.equal(r.focus.focusedId,id);near(Math.atan2(Math.sin(r.controls.getAzimuthalAngle()-Math.atan2(...view.front)),Math.cos(r.controls.getAzimuthalAngle()-Math.atan2(...view.front))),0);const phi=view.polarAngle??buildingFocusPolarAngle;near(r.controls.getPolarAngle(),Math.atan2(Math.sin(phi),(view.heightScale??1)*Math.cos(phi)));validate(r);}
});
check('Front focus rotates along shortest azimuth arc',()=>{
 const r=rig(),id='nyu-kimmel-center',end=Math.atan2(...buildingViews[id].front),start=end-5.5;
 r.camera.position.setFromSpherical(new T.Spherical(300,.6,start)).add(r.controls.target);r.controls.update();const before=r.controls.getAzimuthalAngle();r.focus.focus(model(),id);r.focus.update(.275);const mid=r.controls.getAzimuthalAngle();const delta=Math.atan2(Math.sin(end-before),Math.cos(end-before));near(Math.atan2(Math.sin(mid-before),Math.cos(mid-before)),delta*(1-(1+10*.275)*Math.exp(-10*.275)));done(r);
});
check('Ordinary zoom levels accumulate wheel bursts from destination, with smooth spring settling',()=>{
 const r=rig();assert(r.focus.zoom('in',{fine:false}));assert(r.focus.zoom('in',{fine:false}));assert(r.focus.zoom('in',{fine:false}));r.focus.update(.16);assert(r.focus.active);validate(r);r.focus.update(10);near(r.camera.position.distanceTo(r.controls.target),180);assert.equal(r.focus.active,false);
 r.focus.zoom('out',{fine:false});r.focus.update(10);near(r.camera.position.distanceTo(r.controls.target),260);assert.equal(r.focus.zoom(0),false);
});
check('Fine zoom factor1.1 preserves pending front destination and target during focus',()=>{
 const r=rig(),expected=rig(),id='nyu-global-center';expected.focus.focus(model(),id);done(expected);const distance=expected.camera.position.distanceTo(expected.controls.target);
 r.focus.focus(model(),id);r.focus.update(.1);r.focus.zoom('in');r.focus.zoom('in');r.focus.update(10);assert.equal(r.focus.active,false);near(r.camera.position.distanceTo(r.controls.target),distance/1.21);near(r.controls.target.distanceTo(expected.controls.target),0);near(r.controls.getAzimuthalAngle(),expected.controls.getAzimuthalAngle());assert.equal(r.focus.focusedId,id);
 r.focus.cancel();assert.equal(r.focus.focusedId,id);r.focus.clearFocus();assert.equal(r.focus.focusedId,null);r.controls.update();validate(r);
});
check('Focused-only65degree view and78degree orbit cap; smooth zoom-out restores overview range',()=>{
 const r=rig();near(r.controls.maxPolarAngle,limits.maxPolarAngle);near(buildingFocusPolarAngle,65*Math.PI/180);near(buildingFocusedMaxPolarAngle,78*Math.PI/180);r.focus.focus(model(),'nyu-kimmel-center');done(r);near(r.controls.maxPolarAngle,buildingFocusedMaxPolarAngle);
 for(let i=0;i<40&&r.focus.focusedId;i++){r.focus.zoom('out');const before=pose(r);r.focus.update(0);pose(r).forEach((v,j)=>near(v,before[j]));done(r);}
 assert.equal(r.focus.focusedId,null);near(r.controls.maxPolarAngle,limits.maxPolarAngle);assert(r.controls.getPolarAngle()<=limits.maxPolarAngle+1e-8);validate(r);
});
check('Pinch-end reconciliation smoothly restores overview and cancel retains focused range',()=>{
 const r=rig();r.focus.focus(model(),'nyu-global-center');done(r);r.focus.cancel();assert.equal(r.focus.focusedId,'nyu-global-center');near(r.controls.maxPolarAngle,buildingFocusedMaxPolarAngle);
 const direction=r.camera.position.clone().sub(r.controls.target).normalize();r.camera.position.copy(r.controls.target).addScaledVector(direction,limits.maxDistance);r.controls.update();const before=pose(r);assert(r.focus.reconcile());pose(r).forEach((v,i)=>near(v,before[i]));done(r);assert.equal(r.focus.focusedId,null);near(r.controls.maxPolarAngle,limits.maxPolarAngle);
});
check('Exact spring matches30/60/144Hz at equal elapsed time',()=>{
 const samples=[30,60,144].map(hz=>{const r=rig();r.focus.focus(model(),'nyu-kimmel-center');for(let i=0;i<hz;i++)r.focus.update(1/hz);validate(r);return pose(r);});for(const sample of samples.slice(1))sample.forEach((v,i)=>near(v,samples[0][i],1e-8));
});
check('Repeated refocus and wheel retarget preserve momentum rather than restarting easing',()=>{
 const r=rig(),reference=rig();for(const a of [r,reference]){a.focus.focus(model(),'nyu-kimmel-center');a.focus.update(.15);}const before=pose(r);r.focus.focus(model(),'nyu-kimmel-center');pose(r).forEach((v,i)=>near(v,before[i]));r.focus.update(.02);reference.focus.update(.02);pose(r).forEach((v,i)=>near(v,pose(reference)[i]));
 const z=rig();z.focus.zoom('in',{fine:false});z.focus.update(.08);const first=z.camera.position.distanceTo(z.controls.target);z.focus.zoom('in',{fine:false});const same=z.camera.position.distanceTo(z.controls.target);near(first,same);z.focus.update(.001);assert(z.camera.position.distanceTo(z.controls.target)<first-.001);done(z);
});
check('Invalid delta no-ops, extreme finite frame settles safely, reduced motion immediate',()=>{
 const r=rig();r.focus.focus(model(),'nyu-kimmel-center');const before=pose(r);for(const dt of [0,-1,NaN,Infinity])assert.equal(r.focus.update(dt),false);assert.deepEqual(pose(r),before);r.focus.update(Number.MAX_VALUE);assert.equal(r.focus.active,false);validate(r);
 const rm=rig(1.6,()=>true);rm.focus.focus(model(),'nyu-kimmel-center');rm.focus.update(.001);assert.equal(rm.focus.active,false);const view=buildingViews['nyu-kimmel-center'];near(rm.controls.getPolarAngle(),Math.atan2(Math.sin(view.polarAngle),view.heightScale*Math.cos(view.polarAngle)));validate(rm);
});
check('Deselect leaveFocus transitions smoothly back to overview without pose jump',()=>{
 const r=rig();r.focus.focus(model(),'nyu-kimmel-center');done(r);const before=pose(r),focusedPolar=r.controls.getPolarAngle();assert(r.focus.leaveFocus());pose(r).forEach((v,i)=>near(v,before[i]));r.focus.update(.02);assert(r.focus.active);assert(r.controls.getPolarAngle()<focusedPolar);done(r);assert.equal(r.focus.focusedId,null);near(r.controls.maxPolarAngle,limits.maxPolarAngle);
});
const traces={};
check('Continuous outward trackpad with tiny tail and mouse bursts stay monotonic and bounded',()=>{
 for(const [name,deltas] of [['trackpad',[...Array(40).fill(10),8,6,4,2,1,.5,.1]],['mouse',[100,0,0,0,100,0,0,0,100]]]){const r=rig();r.focus.zoom('in',{fine:false});done(r);r.focus.zoom('in',{fine:false});done(r);const trace=[];for(const d of deltas){if(d)r.focus.zoomDelta(d);r.focus.update(1/60);validate(r);trace.push(r.camera.position.distanceTo(r.controls.target));}r.focus.endZoomGesture();for(let i=0;i<180;i++){r.focus.update(1/60);validate(r);trace.push(r.camera.position.distanceTo(r.controls.target));}for(let i=1;i<trace.length;i++)assert(trace[i]>=trace[i-1]-1e-7);assert(trace.every(n=>n<=limits.maxDistance+1e-8));traces[name]=trace;}
});
check('Fresh one-pixel input is proportional, reversal responds and cap settles without overshoot',()=>{
 const r=rig();r.focus.zoom('in',{fine:false});done(r);const d=r.camera.position.distanceTo(r.controls.target);r.focus.zoomDelta(1);r.focus.update(10);near(r.camera.position.distanceTo(r.controls.target),d*Math.exp(.002));r.focus.zoomDelta(1000);r.focus.update(.1);const before=r.camera.position.distanceTo(r.controls.target);r.focus.zoomDelta(-1000);r.focus.update(10);assert(r.camera.position.distanceTo(r.controls.target)<before);validate(r);
 const cap=rig();cap.focus.zoom('in',{fine:false});done(cap);cap.focus.zoomDelta(5000);let last=0;for(let i=0;i<180;i++){cap.focus.update(1/60);const n=cap.camera.position.distanceTo(cap.controls.target);assert(n<=limits.maxDistance+1e-8&&n>=last-1e-8);last=n;}near(last,limits.maxDistance);
});
check('Continuous focused outward gesture exits to overview; manual cancellation freezes motion',()=>{
 const r=rig();r.focus.focus(model(),'nyu-kimmel-center');done(r);for(let i=0;i<80;i++){r.focus.zoomDelta(40);r.focus.update(1/60);validate(r);}r.focus.endZoomGesture();done(r);assert.equal(r.focus.focusedId,null);near(r.controls.maxPolarAngle,limits.maxPolarAngle);
 r.focus.zoomDelta(-100);r.focus.update(.1);r.focus.cancel();const before=pose(r);r.focus.update(1);pose(r).forEach((v,i)=>near(v,before[i]));
});
check('First outward focused scroll returns saved pre-focus full pose across building switches',()=>{
 const r=rig();r.focus.zoom('in',{fine:false});done(r);const original=pose(r);r.focus.focus(model(),'nyu-kimmel-center');done(r);r.focus.cancel({preserveOverview:true});r.focus.focus(model(-100,-50),'nyu-global-center');done(r);assert(r.focus.zoomDelta(1));assert(r.focus.returning);done(r);pose(r).forEach((v,i)=>near(v,original[i]));assert.equal(r.focus.focusedId,null);
});
check('Repeated outward events do not restart or retarget an active overview return',()=>{
 const a=rig(),b=rig();for(const r of [a,b]){r.focus.focus(model(),'nyu-kimmel-center');done(r);r.focus.zoomDelta(3);}
 for(let i=0;i<45;i++){assert.equal(a.focus.zoomDelta(20),false);a.focus.update(1/60);b.focus.update(1/60);pose(a).forEach((v,j)=>near(v,pose(b)[j]));}done(a);done(b);
});
check('Bobst and Silver pull back 20% at their existing angles without compounding',()=>{
 for(const id of ['bobst-library','nyu-silver-center']){
  const r=rig(),root=model(),box=new T.Box3().setFromObject(root);box.min.y-=4.5;box.max.y+=4.5;
  const distance=box.getSize(new T.Vector3()).length()/2/Math.sin(43*Math.PI/360)*1.12*1.2;
  assert(r.focus.focus(root,id));done(r);near(r.camera.position.distanceTo(r.controls.target),distance);
  const first=pose(r);assert(r.focus.focus(root,id));done(r);pose(r).forEach((n,i)=>near(n,first[i]));
 }
});
result.traces=traces;
const evidenceDir=process.env.MAP_EVIDENCE??'evidence/m11-atmosphere-navigation';
fs.mkdirSync(evidenceDir,{recursive:true});fs.writeFileSync(`${evidenceDir}/clickfocus-results.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,traces:Object.fromEntries(Object.entries(traces).map(([k,v])=>[k,{frames:v.length,start:v[0],end:v.at(-1)}]))},null,2));
