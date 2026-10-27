import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createCameraFocus} from '../src/map/camera/camera-focus.js';
import {mapFocusLayout} from '../src/map/camera/map-focus-layout.js';
const limits={minDistance:15,maxDistance:470,minPolarAngle:.01,maxPolarAngle:1.2,minCameraHeight:1,targetBounds:{minX:-780,maxX:780,minY:1,maxY:150,minZ:-780,maxZ:970}};
function rig(width=390,height=844){
 const camera=new T.PerspectiveCamera(43,width/height,.5,6000);camera.position.set(100,200,300);
 const controls=new OrbitControls(camera,null);controls.target.set(0,20,0);Object.assign(controls,{enableDamping:true,minDistance:15,maxDistance:470,minPolarAngle:.01,maxPolarAngle:1.2});controls.update();
 const focus=createCameraFocus({camera,controls,limits,constrainPan:()=>{},getFramingRect:()=>mapFocusLayout(width,height).frame});
 const root=new T.Mesh(new T.BoxGeometry(150,90,110),new T.MeshBasicMaterial());root.position.set(85,45,193);
 return{camera,controls,focus,root};
}
function settle(r){for(let i=0;i<240;i++){r.focus.update(1/60);assert(Number.isFinite(r.camera.zoom)&&r.camera.zoom>0);assert(r.camera.position.distanceTo(r.controls.target)<=470+1e-7);}assert(!r.focus.active);}
test('Desktop and compact card layouts reserve disjoint building space and mobile assistant clearance',()=>{
 for(const [w,h] of [[1440,1000],[783,514],[390,844],[560,320]]){
  const {frame,card}=mapFocusLayout(w,h);assert(frame.left<frame.right&&frame.top<frame.bottom);
  if(card.bottomAligned){assert(frame.bottom<h-card.margin-card.maxHeight);assert(h-card.margin<=h-30);}else assert(frame.right<card.left);
 }
});
test('Large compact focus smoothly widens the lens within the distance cap and refocus does not compound zoom',()=>{
 const r=rig();const start=r.camera.zoom;assert(r.focus.focus(r.root,'nyu-john-a-paulson-center'));assert.equal(r.camera.zoom,start);
 r.focus.update(.1);assert(r.camera.zoom<start);settle(r);const zoom=r.camera.zoom;assert(zoom<1);
 assert(r.focus.focus(r.root,'nyu-john-a-paulson-center'));settle(r);assert(Math.abs(r.camera.zoom-zoom)<1e-10);
 const box=new T.Box3().setFromObject(r.root),frame=mapFocusLayout(390,844).frame;r.camera.updateMatrixWorld();
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new T.Vector3(x,y,z).project(r.camera);assert((p.x+1)*195>=frame.left-1&&(p.x+1)*195<=frame.right+1);assert((1-p.y)*422>=frame.top-1&&(1-p.y)*422<=frame.bottom+1);}

});
test('Returning after building switches restores complete overview pose and lens; manual cancellation also restores lens on exit',()=>{
 const r=rig(),position=r.camera.position.clone(),target=r.controls.target.clone();
 r.focus.focus(r.root,'nyu-john-a-paulson-center');settle(r);r.focus.focus(r.root,'stern-school-of-business');settle(r);r.focus.leaveFocus();settle(r);
 assert(r.camera.position.distanceTo(position)<1e-5);assert(r.controls.target.distanceTo(target)<1e-5);assert.equal(r.camera.zoom,1);assert.equal(r.focus.focusedId,null);
 r.focus.focus(r.root,'nyu-john-a-paulson-center');settle(r);r.focus.cancel();r.focus.leaveFocus();settle(r);assert.equal(r.camera.zoom,1);
 r.focus.focus(r.root,'nyu-john-a-paulson-center');settle(r);r.focus.cancel();const manualZoom=r.camera.zoom;r.focus.focus(r.root,'stern-school-of-business');settle(r);r.focus.leaveFocus();settle(r);assert(Math.abs(r.camera.zoom-manualZoom)<1e-10);
});
