import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createMapEventIndicators} from '../src/map/presence/map-event-indicators.js';
import {createLandmarkEffects} from '../src/map/landmarks/landmark-effects.js';

const at = Date.parse('2026-11-01T12:00:00Z');
const event = (patch = {}) => ({kind:'scheduled_event',status:'confirmed',starts:at,ends:at+1000,...patch});
function rig({available=true,reducedMotion=false}={}) {
  const saved = globalThis.document, calls=[];
  const context = new Proxy({}, {set(o,k,v){calls.push([k,v]);o[k]=v;return true;},get(o,k){return k in o?o[k]:(...args)=>calls.push([k,...args]);}});
  globalThis.document = {createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext(type){assert.equal(type,'2d');return context;}};}};
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(43,1.4,.5,6000);camera.position.set(200,200,450);camera.lookAt(200,30,300);
  const root=new T.Group();root.position.set(200,0,300);
  const wall=new T.Mesh(new T.BoxGeometry(20,50,16),new T.MeshStandardMaterial({color:'#965d52'}));wall.position.y=25;
  const tank=new T.Mesh(new T.CylinderGeometry(2,2,8),new T.MeshStandardMaterial({color:'#999999'}));tank.position.set(4,58,2);
  root.add(wall,tank);scene.add(root);const roots=new Map(available?[['a',root]]:[]);
  const controller=createMapEventIndicators({scene,camera,getRoot:id=>roots.get(id),reducedMotion});
  return {scene,camera,root,roots,controller,calls,restore(){controller.dispose();if(saved===undefined)delete globalThis.document;else globalThis.document=saved;}};
}
function sourceState(root) {
  root.updateMatrixWorld(true); const out=[];
  root.traverse(m=>{if(m.isMesh)out.push({geometry:m.geometry,material:m.material,positions:Array.from(m.geometry.attributes.position.array),matrix:m.matrixWorld.toArray(),color:m.material.color.getHexString()});});return out;
}

test('Only current confirmed scheduled events activate; all-day timestamps, exact boundaries and overlaps work without participants',()=>{
  const r=rig();try{
    const inactive=[event({kind:'personal_plan'}),event({kind:'presence'}),event({kind:undefined}),event({status:'tentative'}),event({status:'cancelled'}),event({ends:at}),event({starts:at+1}),event({ends:at-1}),event({starts:NaN,startsAt:'invalid'}),event({starts:at,ends:at})];
    for(const e of inactive){r.controller.setBuildings([{id:'a',people:[],events:[e]}],at);assert.deepEqual(r.controller.snapshot().activeBuildingIds,[]);}
    r.controller.setBuildings([{id:'a',people:[],events:[event(),event({ends:at+2000})]}],at);
    assert.deepEqual(r.controller.snapshot().activeBuildingIds,['a']);assert.equal(r.controller.snapshot().resources.markers,1);
    r.controller.update(at+1000);assert.equal(r.controller.snapshot().resources.markers,1);
    r.controller.update(at+2000);assert.equal(r.controller.snapshot().resources.markers,0);
    // Fall-back day is 25 hours in America/New_York; the API supplies actual timestamps.
    const start=Date.parse('2026-11-01T04:00:00Z'),end=Date.parse('2026-11-02T05:00:00Z');
    r.controller.setBuildings([{id:'a',events:[{kind:'scheduled_event',status:'confirmed',allDay:true,startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString()}]}],start);
    assert.deepEqual(r.controller.snapshot().activeBuildingIds,['a']);r.controller.update(end-1);assert.equal(r.controller.snapshot().resources.markers,1);r.controller.update(end);assert.equal(r.controller.snapshot().resources.markers,0);
  }finally{r.restore();}
});

test('Independent buildings activate at wall-clock boundaries without polling; missing and replaced roots reconcile lazily',()=>{
  const r=rig({available:false});try{
    r.controller.setBuildings([{id:'a',events:[event()]},{id:'b',events:[event({starts:at+500,ends:at+1500})]}],at);
    assert.deepEqual(r.controller.snapshot().pendingBuildingIds,['a']);
    r.roots.set('a',r.root);r.controller.update(at+1);assert.equal(r.controller.snapshot().resources.markers,1);
    r.roots.set('b',r.root.clone());r.scene.add(r.roots.get('b'));r.controller.update(at+500);
    assert.deepEqual(r.controller.snapshot().activeBuildingIds,['a','b']);assert.equal(r.controller.snapshot().resources.markers,2);
    r.controller.update(at+1000);assert.deepEqual(r.controller.snapshot().activeBuildingIds,['b']);
    r.roots.delete('b');r.controller.update(at+1001);assert.equal(r.controller.snapshot().resources.markers,0);assert.deepEqual(r.controller.snapshot().pendingBuildingIds,['b']);
    r.controller.update(at+1500);assert.deepEqual(r.controller.snapshot().activeBuildingIds,[]);
    r.controller.update(at+200);assert.deepEqual(r.controller.snapshot().activeBuildingIds,['a']);
  }finally{r.restore();}
});

test('Failure clears immediately, recovery restores, steady updates avoid rescanning/bounds work and source data stays untouched',()=>{
  const r=rig();try{
    const before=sourceState(r.root),disposed=new Map(before.map(s=>[s.geometry,0]));for(const [g]of disposed)g.addEventListener('dispose',()=>disposed.set(g,disposed.get(g)+1));
    const catalogue=[{id:'a',events:[event({ends:at+100000})]}];r.controller.setBuildings(catalogue,at);
    const steady=r.controller.snapshot();for(let i=1;i<1000;i++)r.controller.update(at+i);
    assert.equal(r.controller.snapshot().reconciliations,steady.reconciliations);assert.equal(r.controller.snapshot().boundsComputations,steady.boundsComputations);
    r.controller.setBuildings([],at+1000);assert.equal(r.controller.snapshot().resources.markers,0);assert.equal(r.scene.children.filter(n=>n.name.startsWith('Active event')).length,0);
    r.controller.setBuildings(catalogue,at+1001);assert.equal(r.controller.snapshot().resources.markers,1);assert.deepEqual(sourceState(r.root),before);
    const owned=new Set();r.scene.traverse(n=>{if(n.userData.mapDecoration&&n.material){owned.add(n.material);if(n.material.map)owned.add(n.material.map);}});
    const counts=new Map([...owned].map(v=>[v,0]));for(const resource of owned)resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));
    r.controller.dispose();r.controller.dispose();assert([...counts.values()].every(n=>n===1));assert([...disposed.values()].every(n=>n===0));assert.deepEqual(sourceState(r.root),before);assert.equal(r.controller.snapshot().disposed,true);
  }finally{r.restore();}
});

test('Reference exclamation artwork/render style is exact, whole bounds include tank, decorations do not raycast and white selection coexists',()=>{
  const r=rig({reducedMotion:true});try{
    r.controller.setBuildings([{id:'a',events:[event()]}],at);
    assert.deepEqual(r.calls,[['shadowColor','rgba(242, 201, 76, 0.92)'],['shadowBlur',30],['fillStyle','#f2c94c'],['fillRect',104,47,48,170],['strokeStyle','#17140f'],['lineWidth',8],['strokeRect',104,47,48,170],['beginPath'],['arc',128,263,24,0,Math.PI*2],['fill'],['stroke']]);
    const decoration=r.scene.children.find(n=>n.name==='Active event a'),sprite=decoration.children.find(n=>n.isSprite),glows=decoration.children.filter(n=>n.isMesh);
    assert.equal(sprite.material.map.image.width,256);assert.equal(sprite.material.map.image.height,320);assert.equal(sprite.material.map.colorSpace,T.SRGBColorSpace);
    for(const key of ['depthTest','depthWrite','toneMapped'])assert.equal(sprite.material[key],false);assert.equal(sprite.material.transparent,true);assert.equal(sprite.renderOrder,21);
    assert.equal(glows.length,2);for(const m of glows){assert.equal(m.material.color.getHexString(),'f2c94c');assert.equal(m.material.opacity,.14);assert.equal(m.material.blending,T.AdditiveBlending);assert.equal(m.renderOrder,3);assert(sourceState(r.root).some(s=>s.geometry===m.geometry));}
    const first=r.controller.snapshot().markers[0];assert.equal(first.bounds.max[1],62);assert(first.position[1]-first.scale[1]/2>=64);assert(Math.abs(first.scale[0]/first.scale[1]-.8)<1e-9);
    decoration.traverse(n=>{const hits=[];n.raycast(new T.Raycaster(),hits);assert.deepEqual(hits,[]);});
    const effects=createLandmarkEffects({scene:r.scene,reducedMotion:true});effects.register('a',r.root);effects.setActive('a','a');effects.update(.05);r.controller.update(at+200);
    assert.equal(effects.snapshot().ringMeshes,2);assert.equal(effects.snapshot().outline.proxyCount,2);assert.equal(r.controller.snapshot().resources.markers,1);
    const white=r.scene.children.find(n=>n.name==='Landmark glow a');assert(white);assert.equal(white.children[0].material.color.getHexString(),'ffffff');assert.equal(white.children[0].renderOrder,4);
    assert.deepEqual(r.controller.snapshot().markers[0].position,first.position,'Reduced motion has no bob/pulse');effects.dispose();assert.equal(r.controller.snapshot().resources.markers,1);
  }finally{r.restore();}
});

test('Instanced source details share original buffers and snapshot mutation cannot alter controller state',()=>{
  const r=rig();try{
    const geometry=new T.BoxGeometry(),material=new T.MeshStandardMaterial({color:'#765432'}),source=new T.InstancedMesh(geometry,material,2);
    source.setMatrixAt(0,new T.Matrix4().makeTranslation(-4,70,0));source.setMatrixAt(1,new T.Matrix4().makeTranslation(4,75,0));r.root.add(source);
    const matrixBefore=Array.from(source.instanceMatrix.array);let disposals=0;geometry.addEventListener('dispose',()=>disposals++);material.addEventListener('dispose',()=>disposals++);
    r.controller.setBuildings([{id:'a',events:[event()]}],at);
    const decoration=r.scene.children.find(n=>n.name==='Active event a'),view=decoration.children.find(n=>n.isInstancedMesh);
    assert(view);assert.equal(view.geometry,geometry);assert.equal(view.instanceMatrix,source.instanceMatrix);assert.equal(view.count,2);assert.equal(r.controller.snapshot().markers[0].bounds.max[1],75.5);
    const snapshot=r.controller.snapshot();snapshot.activeBuildingIds.push('forged');snapshot.markers[0].position[1]=-999;
    r.controller.update(at+1);assert.deepEqual(r.controller.snapshot().activeBuildingIds,['a']);assert(r.controller.snapshot().markers[0].position[1]>75.5);
    r.controller.dispose();assert.equal(disposals,0);assert.deepEqual(Array.from(source.instanceMatrix.array),matrixBefore);assert.equal(source.material.color.getHexString(),'765432');
  }finally{r.restore();}
});
