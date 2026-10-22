import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='evidence/camera-framing';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try {
 for(const viewport of [{width:1440,height:1000},{width:783,height:514},{width:390,height:844}]){
  const page=await browser.newPage({viewport,reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5175/');
  await page.waitForFunction(()=>window.__map?.snapshot().status==='ready'&&document.querySelector('#app').dataset.state==='entered',null,{timeout:60000});
  const close=page.getByRole('button',{name:'Close assistant',exact:true});if(await close.isVisible())await close.click();
  const ids=await page.evaluate(()=>window.__map.snapshot().landmarks.map(x=>x.id));
  for(const id of ids){
   await page.evaluate(id=>{window.__map.select(id);window.__map.focus();},id);await page.waitForTimeout(100);
   const check=await page.evaluate(async id=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {mapFocusLayout}=await import('/src/map-focus-layout.js');
    const snapshot=window.__map.snapshot(),pose=snapshot.camera,bounds=snapshot.landmarks.find(x=>x.id===id).bounds;
    const camera=new T.PerspectiveCamera(pose.fov,innerWidth/innerHeight,pose.near,pose.far);camera.position.fromArray(pose.position);camera.zoom=pose.zoom;camera.lookAt(new T.Vector3().fromArray(pose.target));camera.updateMatrixWorld();camera.updateProjectionMatrix();
    const points=[];for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]]){const p=new T.Vector3(x,y,z).project(camera);points.push({x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2});}
    const box={left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
    const card=document.querySelector('.map-presence__building-card').getBoundingClientRect();const frame=mapFocusLayout(innerWidth,innerHeight).frame;
    const visible=box.left>=frame.left-2&&box.right<=frame.right+2&&box.top>=frame.top-2&&box.bottom<=frame.bottom+2;
    const overlap=box.left<card.right&&box.right>card.left&&box.top<card.bottom&&box.bottom>card.top;
    return{id,viewport:{width:innerWidth,height:innerHeight},box,frame,card:{left:card.left,right:card.right,top:card.top,bottom:card.bottom},visible,overlap};
   },id);
   results.push(check);
   if(['nyu-silver-center','nyu-john-a-paulson-center'].includes(id))await page.screenshot({path:`${out}/${viewport.width}-${id}.png`});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify({checks:results.length,failures:results.filter(r=>!r.visible||r.overlap)},null,2));
 assert(results.every(r=>r.visible&&!r.overlap));
}finally{await browser.close();}
