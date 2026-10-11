import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import * as T from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {createGlobalCenterModel} from '../../src/global-center.js';
import {createKimmelModel} from '../../src/kimmel.js';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const doc=await io.read('yuyang-site-3d-assets/models/buildings/city-tiles/tile--1_0.glb');
const tile=new T.Group();
for(const n of doc.getRoot().listNodes())for(const p of n.getMesh()?.listPrimitives()??[]){
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(Array.from({length:p.getAttribute('POSITION').getCount()},(_,i)=>p.getAttribute('POSITION').getElement(i,[])).flat(),3));
 if(p.getIndices())g.setIndex(Array.from(p.getIndices().getArray()));g.applyMatrix4(new T.Matrix4().fromArray(n.getWorldMatrix()));tile.add(new T.Mesh(g));
}
const model=createGlobalCenterModel(tile),context=createKimmelModel(tile),scene=new T.Group();scene.add(model,context);scene.updateMatrixWorld(true);
const target=new T.Vector3(-64,20,106), light=new T.Vector3(-.3,1,-.8).normalize(),W=1200,H=1000;
for(const [name,offset] of [['north',new T.Vector3(20,65,-135)],['west',new T.Vector3(-130,75,-80)],['rear',new T.Vector3(-60,85,130)]]){
 const camera=new T.OrthographicCamera(-65,65,54,-54,.1,1000);camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateMatrixWorld();
 const pixels=Buffer.alloc(W*H*3),depth=new Float64Array(W*H).fill(Infinity);for(let i=0;i<W*H;i++){pixels[i*3]=229;pixels[i*3+1]=227;pixels[i*3+2]=218;}
 scene.traverse(m=>{if(!m.isMesh)return;const p=m.geometry.attributes.position,idx=m.geometry.index;
 for(let i=0;i<(idx?.count??p.count);i+=3){const pts=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,idx?idx.getX(i+j):i+j).applyMatrix4(m.matrixWorld));
 const normal=pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize();if(normal.dot(camera.position.clone().sub(pts[0]))<0)normal.negate();
 const shade=.65+.35*Math.max(0,normal.dot(light)),color=m.material.color.clone().multiplyScalar(shade).getHex();
 const v=pts.map(v=>{v.project(camera);return [(v.x+1)*W/2,(1-v.y)*H/2,v.z];});
 const [[ax,ay,az],[bx,by,bz],[cx,cy,cz]]=v,den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<1e-8)continue;
 const x0=Math.max(0,Math.floor(Math.min(ax,bx,cx))),x1=Math.min(W-1,Math.ceil(Math.max(ax,bx,cx))),y0=Math.max(0,Math.floor(Math.min(ay,by,cy))),y1=Math.min(H-1,Math.ceil(Math.max(ay,by,cy)));
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const a=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/den,b=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/den,c=1-a-b;if(a<0||b<0||c<0)continue;const z=a*az+b*bz+c*cz,index=y*W+x;if(z>=depth[index])continue;depth[index]=z;pixels[index*3]=(color>>16)&255;pixels[index*3+1]=(color>>8)&255;pixels[index*3+2]=color&255;}
 }});
 const output='evidence/m8-gcasl/offline-'+name+'.png';
 const py='import sys,io\nfrom PIL import Image,ImageDraw\nim=Image.open(io.BytesIO(sys.stdin.buffer.read()))\nImageDraw.Draw(im).text((20,20),"OFFLINE GEOMETRY REVIEW - GCASL + Kimmel (not browser evidence)",fill="#202020")\nim.save(sys.argv[1])';
 const r=spawnSync('python',['-c',py,output],{input:Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`),pixels])});if(r.status!==0)throw new Error(String(r.stderr));console.log(output);
}
