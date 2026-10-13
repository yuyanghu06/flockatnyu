import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Vector3 } from 'three';
import { createKeyboardPan } from '../src/keyboard-pan.js';
import { constrainPan } from '../src/geometry.js';
class Events {
  listeners = new Map();
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name, fn) { assert.equal(this.listeners.get(name), fn); this.listeners.delete(name); }
  emit(name, detail = {}) { const event = { preventDefault() { this.prevented = true; }, ...detail }; this.listeners.get(name)?.(event); return event; }
}
function rig() {
  const eventTarget = new Events(), documentTarget = new Events();
  documentTarget.querySelector = () => documentTarget.modal;
  const camera = { position: new Vector3(0, 50, 100) };
  const controls = { target: new Vector3(), enabled: true, update() {} };
  const navigation = { cancelled: 0, cancel() { this.cancelled++; } };
  const limits = { minCameraHeight: 1, targetBounds: { minX: -10, maxX: 10, minY: 0, maxY: 100, minZ: -10, maxZ: 10 } };
  const pan = createKeyboardPan({ camera, controls, navigation, limits, constrainPan, eventTarget, documentTarget });
  return { pan, camera, controls, navigation, eventTarget, documentTarget };
}
const checks=[];
const check=(name, fn)=>{fn();checks.push({name,pass:true});};
const near=(a,b)=>assert(Math.abs(a-b)<1e-8);
check('W/S and A/D move with camera bearing, preserving height, angle and distance',()=>{
 for(const [code,x,z] of [['KeyW',0,-1],['KeyS',0,1],['KeyA',-1,0],['KeyD',1,0]]){
  const r=rig(),offset=r.camera.position.clone().sub(r.controls.target);assert(r.eventTarget.emit('keydown',{code}).prevented);r.pan.update(.1);
  assert(Math.sign(r.controls.target.x)===x&&Math.sign(r.controls.target.z)===z);assert(r.camera.position.clone().sub(r.controls.target).distanceTo(offset)<1e-8);near(r.controls.target.y,0);assert.equal(r.navigation.cancelled,1);
  r.eventTarget.emit('keyup',{code});const position=r.camera.position.clone();r.pan.update(.1);assert.equal(r.camera.position.distanceTo(position),0);r.pan.dispose();assert.equal(r.eventTarget.listeners.size,0);
 }
 const r=rig();r.camera.position.set(100,50,0);r.eventTarget.emit('keydown',{code:'KeyW'});r.pan.update(.1);assert(r.controls.target.x<0);near(r.controls.target.z,0);
});
check('Diagonal speed is normalized, opposite keys cancel, and steps are time based',()=>{
 const a=rig(),b=rig();a.eventTarget.emit('keydown',{code:'KeyW'});b.eventTarget.emit('keydown',{code:'KeyW'});b.eventTarget.emit('keydown',{code:'KeyD'});a.pan.update(.1);b.pan.update(.1);near(a.controls.target.length(),b.controls.target.length());
 const c=rig();c.eventTarget.emit('keydown',{code:'KeyW'});c.pan.update(.05);c.pan.update(.05);near(a.controls.target.length(),c.controls.target.length());
 c.eventTarget.emit('keydown',{code:'KeyS'});assert.equal(c.pan.update(.1),false);
});
check('Pan clamps target bounds while translating the camera equally, with bounded suspended-frame steps',()=>{
 const r=rig(),offset=r.camera.position.clone().sub(r.controls.target);r.eventTarget.emit('keydown',{code:'KeyD'});for(let i=0;i<20;i++)r.pan.update(.1);near(r.controls.target.x,10);assert(r.camera.position.clone().sub(r.controls.target).distanceTo(offset)<1e-8);
 const a=rig(),b=rig();for(const rig of [a,b])rig.eventTarget.emit('keydown',{code:'KeyW'});a.pan.update(100);b.pan.update(.1);near(a.controls.target.distanceTo(b.controls.target),0);
});
check('Typing, modal dialogs, modifiers, loading and hidden tabs never consume WASD',()=>{
 for(const condition of ['typing','contenteditable','modal','loading','hidden','ctrl','meta','alt','composing','prevented']){
  const r=rig(),event={code:'KeyW'};
  if(condition==='typing')event.target={closest:()=>true};if(condition==='contenteditable')event.target={isContentEditable:true};
  if(condition==='modal')r.documentTarget.modal=true;if(condition==='loading')r.controls.enabled=false;if(condition==='hidden')r.documentTarget.hidden=true;
  if(['ctrl','meta','alt'].includes(condition))event[condition+'Key']=true;if(condition==='composing')event.isComposing=true;if(condition==='prevented')event.defaultPrevented=true;
  assert(!r.eventTarget.emit('keydown',event).prevented);assert.equal(r.pan.update(.1),false);near(r.controls.target.length(),0);
 }
});
check('Blur, focus transfer and tab hiding clear held keys so motion cannot get stuck',()=>{
 for(const [target,event] of [['eventTarget','blur'],['documentTarget','focusin'],['documentTarget','visibilitychange']]){
  const r=rig();r.eventTarget.emit('keydown',{code:'KeyW'});r[target].emit(event);assert.equal(r.pan.update(.1),false);
 }
 const r=rig();r.eventTarget.emit('keydown',{code:'KeyW'});r.controls.enabled=false;r.pan.update(.1);r.controls.enabled=true;assert.equal(r.pan.update(.1),false);
});
const evidence=process.env.MAP_EVIDENCE||'evidence/m21-map-input';fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(`${evidence}/keyboard-results.json`,JSON.stringify({checks},null,2)+'\n');console.log(`${checks.length}/${checks.length} WASD checks passed`);
