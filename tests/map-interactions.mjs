import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCameraFocus } from '../src/camera-focus.js';
import { constrainPan } from '../src/geometry.js';
import { createMapInteractions } from '../src/map-interactions.js';
import {mapConfig} from './fixtures/map-config.mjs';
class Events {
  handlers=new Map(); options=new Map();clientHeight=600;
  addEventListener(name,fn,options){this.handlers.set(name,fn);this.options.set(name,options);}
  removeEventListener(name,fn){assert.equal(this.handlers.get(name),fn);this.handlers.delete(name);}
  emit(name,values={}){const event={clientX:10,clientY:20,button:0,buttons:0,isPrimary:true,deltaY:0,deltaMode:0,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...values};this.handlers.get(name)?.(event);return event;}
}
function rig(){const element=new Events(),controls=new Events(),calls={focus:[],zoom:[],select:[],hover:[],hits:[],cancel:0,reconcile:0,end:0},roots=new Map();let id='a',time=0;const navigation={focusedId:null,reconcile(){calls.reconcile++;},cancel(){calls.cancel++;},focus(root,name){assert.equal(root,roots.get(name));calls.focus.push(name);this.focusedId=name;},endZoomGesture(){calls.end++;},zoomDelta(d){calls.zoom.push({direction:d,fine:this.focusedId!==null});}};const api=createMapInteractions({element,controls,navigation,hit:event=>{calls.hits.push([event.clientX,event.clientY]);return id;},select:n=>calls.select.push(n),setHovered:n=>calls.hover.push(n),getRoot:n=>{if(!roots.has(n))roots.set(n,{});return roots.get(n);},now:()=>time});return {element,controls,calls,navigation,api,setId:n=>id=n,time:n=>time=n};}
const results={checks:[],limitations:['Synthetic event dispatch only; actual browser propagation, pointer capture and touch interaction remain unverified.']};
const check=(name,fn)=>{fn();results.checks.push({name,pass:true});};
const click=r=>{r.element.emit('pointerdown');r.element.emit('pointerup');};
check('Every configured building focuses on click; blank click only deselects',()=>{
 const ids=mapConfig.buildings.map(row=>row.id);assert(!ids.includes('lipton-hall'),'Lipton remains non-selectable campus context');const r=rig();for(const id of ids){r.setId(id);click(r);}assert.deepEqual(r.calls.focus,ids);assert.deepEqual(r.calls.select,ids);r.setId(null);click(r);assert.equal(r.calls.select.at(-1),null);assert.equal(r.calls.focus.length,ids.length);
});
check('Drag-away-return, threshold move, right button, secondary pointer and cancel never click',()=>{
 for(const scenario of ['return','threshold','right','secondary','cancel']){const r=rig();r.element.emit('pointerdown',{button:scenario==='right'?2:0,isPrimary:scenario!=='secondary'});if(scenario==='return'){r.element.emit('pointermove',{clientX:100,buttons:1});r.element.emit('pointermove',{clientX:10,buttons:1});}if(scenario==='threshold')r.element.emit('pointermove',{clientX:15,buttons:1});if(scenario==='cancel')r.element.emit('pointercancel');r.element.emit('pointerup');assert.equal(r.calls.focus.length,0,scenario);assert.equal(r.calls.select.length,0,scenario);}
});
check('Inward wheel focuses once then fine zooms without retargeting a moving hit during burst',()=>{
 const r=rig();const e=r.element.emit('wheel',{deltaY:-100});assert(e.prevented&&e.stopped);assert.deepEqual(r.calls.focus,['a']);r.setId('b');r.time(80);r.element.emit('wheel',{deltaY:-100});assert.deepEqual(r.calls.focus,['a']);assert.deepEqual(r.calls.zoom,[{direction:-100,fine:true}]);r.time(280);r.element.emit('wheel',{deltaY:-100});assert.deepEqual(r.calls.focus,['a','b']);
});
check('Every outward pixel including tiny tails delivered; gesture ends after180ms once',()=>{
 const r=rig();for(const [t,d] of [[0,10],[20,60],[40,20],[80,1],[100,.1]]){r.time(t);r.element.emit('wheel',{deltaY:d});}assert.deepEqual(r.calls.zoom.map(x=>x.direction),[10,60,20,1,.1]);assert.equal(r.calls.focus.length,0);r.time(279);r.api.update(.1);assert.equal(r.calls.end,0);r.time(280);r.api.update(.001);assert.equal(r.calls.end,1);r.api.update(.1);assert.equal(r.calls.end,1);
});
check('Line/page modes normalize signed delta and reversal remains same gesture',()=>{
 const r=rig();r.setId(null);r.element.emit('wheel',{deltaY:5,deltaMode:1});r.time(20);r.element.emit('wheel',{deltaY:-1,deltaMode:2});assert.deepEqual(r.calls.zoom.map(x=>x.direction),[80,-600]);assert.equal(r.calls.end,0);
});
check('Manual control start cancels navigation; stationary pointer rechecks changed camera at80ms',()=>{
 const r=rig();r.element.emit('pointermove');assert.equal(r.calls.hits.length,0);r.api.update(.08);assert.equal(r.calls.hover.at(-1),'a');r.controls.emit('start');assert.equal(r.calls.cancel,1);r.controls.emit('end');assert.equal(r.calls.reconcile,1);assert.equal(r.calls.hover.at(-1),null);r.setId('b');r.controls.emit('change');const n=r.calls.hover.length;r.api.update(.079);assert.equal(r.calls.hover.length,n);r.api.update(.001);assert.equal(r.calls.hover.at(-1),'b');r.element.emit('pointerleave');r.controls.emit('change');r.api.update(.1);assert.equal(r.calls.hover.at(-1),null);
});
check('Outward overview-return gesture tails suppressed even after transition completes until fresh gesture',()=>{
 const r=rig();r.navigation.zoomDelta=function(d){r.calls.zoom.push(d);this.returning=true;};r.element.emit('wheel',{deltaY:1});r.time(50);r.element.emit('wheel',{deltaY:10});r.navigation.returning=false;r.time(100);r.element.emit('wheel',{deltaY:.1});assert.equal(r.calls.zoom.length,1);r.time(281);r.element.emit('wheel',{deltaY:2});assert.equal(r.calls.zoom.length,2);
});
check('Wheel listeners capture without passive handling; disposal removes every listener',()=>{
 const r=rig();assert.deepEqual(r.element.options.get('wheel'),{capture:true,passive:false});r.api.dispose();assert.equal(r.element.handlers.size,0);assert.equal(r.controls.handlers.size,0);
});
check('Real navigation preserves primary click-switch snapshot but secondary touch pan invalidates it',()=>{
 const make=()=>{const element=new Events(),controls=new Events(),camera=new T.PerspectiveCamera(43,1.6,.5,6000);controls.target=new T.Vector3(74,12,116);controls.enableDamping=true;controls.minPolarAngle=.006885420692679254;controls.maxPolarAngle=.8434529930137906;controls.update=()=>camera.lookAt(controls.target);camera.position.copy(controls.target).add(new T.Vector3(0,250,250));
 const limits={minDistance:15,maxDistance:434.2943200101229,minPolarAngle:controls.minPolarAngle,maxPolarAngle:controls.maxPolarAngle,minCameraHeight:1,targetBounds:{minX:-780,maxX:780,minY:1,maxY:150,minZ:-780,maxZ:970}},navigation=createCameraFocus({camera,controls,limits,constrainPan}),roots={a:new T.Mesh(new T.BoxGeometry(20,30,20)),b:new T.Mesh(new T.BoxGeometry(15,20,15))};roots.a.position.set(40,20,100);roots.b.position.set(-80,20,40);let id='a';createMapInteractions({element,controls,navigation,hit:()=>id,select:()=>{},setHovered:()=>{},getRoot:n=>roots[n]});return {element,controls,camera,navigation,setId:n=>id=n};};
 const pose=r=>[...r.camera.position.toArray(),...r.controls.target.toArray()],same=(a,b)=>a.forEach((v,i)=>assert(Math.abs(v-b[i])<1e-7));
 const primary=make(),original=pose(primary);click(primary);primary.navigation.update(10);primary.setId('b');click(primary);primary.navigation.update(10);primary.navigation.zoomDelta(1);primary.navigation.update(10);same(pose(primary),original);
 const touch=make();click(touch);touch.navigation.update(10);touch.element.emit('pointerdown');touch.element.emit('pointerdown',{isPrimary:false});const shift=new T.Vector3(35,0,-25);touch.controls.target.add(shift);touch.camera.position.add(shift);const pannedTarget=touch.controls.target.clone(),distance=touch.camera.position.distanceTo(pannedTarget);touch.element.emit('pointerup',{isPrimary:false});touch.controls.emit('end');touch.navigation.zoomDelta(1);touch.navigation.update(10);assert(touch.controls.target.distanceTo(pannedTarget)<1e-7);assert(Math.abs(touch.camera.position.distanceTo(pannedTarget)-distance)<1e-7);
 const spy=rig(),calls=[];spy.navigation.cancel=o=>calls.push(o);spy.element.emit('pointerdown');spy.element.emit('pointerdown',{isPrimary:false});spy.element.emit('pointerdown');spy.element.emit('pointermove',{clientX:30,buttons:1});assert.deepEqual(calls,[{preserveOverview:true},{preserveOverview:false},{preserveOverview:true},undefined]);
});
check('Pointer bursts coalesce to latest coordinates at80ms with no per-event hit',()=>{
 const r=rig();for(let i=0;i<200;i++)r.element.emit('pointermove',{clientX:i,clientY:3});assert.equal(r.calls.hits.length,0);r.api.update(.079);assert.equal(r.calls.hits.length,0);r.api.update(.001);assert.deepEqual(r.calls.hits,[[199,3]]);for(let i=0;i<100;i++)r.element.emit('pointermove',{clientX:300+i,clientY:9});r.api.update(.08);assert.deepEqual(r.calls.hits,[[199,3],[399,9]]);
});
check('Outward burst delivers every delta with zero synchronous raycasts',()=>{
 const r=rig();for(let i=0;i<100;i++){r.time(i);r.element.emit('wheel',{deltaY:.25,clientX:15});}assert.equal(r.calls.hits.length,0);assert.equal(r.calls.zoom.length,100);assert.equal(r.calls.zoom.reduce((n,x)=>n+x.direction,0),25);r.api.update(.08);assert.equal(r.calls.hits.length,1);
});
check('Inward blank burst picks once; moved pointer and fresh gesture remain eligible',()=>{
 const r=rig();r.setId(null);for(let i=0;i<100;i++){r.time(i);r.element.emit('wheel',{deltaY:-.25});}assert.equal(r.calls.hits.length,1);assert.equal(r.calls.zoom.length,100);r.setId('b');r.time(110);r.element.emit('wheel',{deltaY:-1,clientX:30});assert.equal(r.calls.hits.length,2);assert.deepEqual(r.calls.focus,['b']);r.time(120);r.element.emit('wheel',{deltaY:-1,clientX:100});assert.equal(r.calls.hits.length,2);r.setId('a');r.time(310);r.element.emit('wheel',{deltaY:-1,clientX:100});assert.equal(r.calls.hits.length,3);assert.deepEqual(r.calls.focus,['b','a']);
});
// A shared capture ancestor receives an event before the canvas; this helper
// preserves event identity and respects stopImmediatePropagation across paths.
function screenRig() {
 const element=new Events(),screen=new Events(),controls=new Events(),calls=[];let time=0,enabled=true;
 const navigation={focusedId:'a',returning:false,zoomDelta(d){calls.push(d);this.returning=true;},endZoomGesture(){},cancel(){},reconcile(){},focus(){throw Error('Outward screen wheel must not pick/focus');}};
 const api=createMapInteractions({element,wheelEventTarget:screen,controls,navigation,isWheelEnabled:()=>enabled,hit:()=>{throw Error('Outward screen wheel must not raycast');},select:()=>{},setHovered:()=>{},getRoot:()=>{},now:()=>time});
 const dispatch=(values={},overCanvas=false)=>{const event=screen.emit('wheel',values);if(overCanvas&&!event.stopped)element.handlers.get('wheel')?.(event);return event;};
 return {element,screen,controls,navigation,calls,api,dispatch,time:n=>time=n,enabled:n=>enabled=n};
}
check('Focused outward screen capture consumes overlay event and returns once for canvas event',()=>{
 for(const overCanvas of [false,true]) {const r=screenRig(),event=r.dispatch({deltaY:2},overCanvas);assert(event.prevented&&event.stopped);assert.deepEqual(r.calls,[2]);assert.equal(r.navigation.returning,true);assert.deepEqual(r.screen.options.get('wheel'),{capture:true,passive:false});}
});
check('Inactive and inward overlay, zero/nonfinite deltas and loading gate retain native event',()=>{
 for(const scenario of ['inactive','inward','zero','nan','infinity','loading']) {const r=screenRig();if(scenario==='inactive')r.navigation.focusedId=null;if(scenario==='loading')r.enabled(false);const e=r.dispatch({deltaY:scenario==='inward'?-5:scenario==='zero'?0:scenario==='nan'?NaN:scenario==='infinity'?Infinity:5});assert(!e.prevented&&!e.stopped,scenario);assert.deepEqual(r.calls,[],scenario);}
});
check('Screen return tails stay consumed after focus clears; idle screen scroll resumes natively',()=>{
 const r=screenRig();r.dispatch({deltaY:1});r.navigation.focusedId=null;r.navigation.returning=false;
 for(const t of [40,80,160,250]) {r.time(t);const e=r.dispatch({deltaY:.1});assert(e.prevented&&e.stopped);}
 assert.deepEqual(r.calls,[1]);r.time(431);r.api.update(.001);const idle=r.dispatch({deltaY:2});assert(!idle.prevented&&!idle.stopped);assert.deepEqual(r.calls,[1]);
});
check('Loading-disabled outward canvas input is untouched and both listener targets dispose',()=>{
 const r=screenRig();r.enabled(false);const event=r.dispatch({deltaY:10},true);assert(!event.prevented&&!event.stopped);assert.deepEqual(r.calls,[]);r.api.dispose();assert.equal(r.screen.handlers.size,0);assert.equal(r.element.handlers.size,0);assert.equal(r.controls.handlers.size,0);
});
console.log(JSON.stringify(results,null,2));
