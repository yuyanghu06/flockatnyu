import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as T from 'three';
const out=process.env.MAP_EVIDENCE||'evidence/m21-map-input',url=process.env.MAP_URL||'http://127.0.0.1:4179';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:process.env.MAP_SOFTWARE_WEBGL==='true'?['--use-angle=swiftshader']:[]});
const checks=[],errors=[];
const check=(name,fn)=>{fn();checks.push({name,pass:true});};
async function fixture(fail=false){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 let held=false,release;const gate=new Promise(resolve=>release=resolve);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:{chat:{configured:true},access:{allowed:true},knowledge:{configured:false}}}));
 await page.route('**/*.glb',async route=>{if(!held){held=true;await gate;if(fail)return route.abort('failed');}return route.continue();});
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(1200);
 return {page,context,release};
}
const camera=page=>page.evaluate(()=>window.__map.snapshot().camera);
const same=(a,b)=>a.position.concat(a.target).forEach((n,i)=>assert(Math.abs(n-b.position.concat(b.target)[i])<.002));
async function close(page){if(await page.getByRole('button',{name:'Close assistant'}).isVisible())await page.getByRole('button',{name:'Close assistant'}).click();await page.locator('#map canvas').focus();}
async function reset(page){await close(page);await page.evaluate(()=>window.__map.reset());await page.mouse.move(5,5);await page.waitForTimeout(300);}
try{
 const {page,context,release}=await fixture();
 check('Branded fullscreen startup overlay gates input with no entry CTA',()=>{});
 assert.equal(await page.locator('#loading-enter,.loading-gear-object').count(),0);assert(await page.locator('#startup-notice').isVisible());const loader=await page.locator('#startup-notice').boundingBox();assert.deepEqual(loader,{x:0,y:0,width:1440,height:1000});assert.equal(await page.locator('#app').evaluate(x=>x.inert),true);
 release();await page.waitForFunction(()=>document.querySelector('#app').dataset.state==='entered',null,{timeout:90000});
 assert.equal(await page.locator('#app').evaluate(x=>x.inert),false);assert(await page.locator('#startup-notice').isHidden());await close(page);
 check('Successful preparation automatically enables map and assistant without a click',()=>{});
 await page.screenshot({path:`${out}/overview-after-loader.png`});
 for(const code of ['w','s','a','d']){
  await reset(page);const a=await camera(page);await page.keyboard.down(code);await page.waitForTimeout(450);await page.keyboard.up(code);await page.waitForTimeout(300);const b=await camera(page);
  const offset=a.position.map((n,i)=>n-a.target[i]),forward=new T.Vector3(-offset[0],0,-offset[2]).normalize(),right=new T.Vector3(-forward.z,0,forward.x),delta=new T.Vector3(...b.target).sub(new T.Vector3(...a.target));
  check('Actual '+code.toUpperCase()+' pans in the camera-relative direction with unchanged zoom/height',()=>{assert(delta.length()>1);const axis=code==='w'||code==='s'?forward:right;assert(delta.dot(axis)*(code==='s'||code==='a'?-1:1)>1);assert(Math.abs(delta.y)<.001);b.position.map((n,i)=>n-b.target[i]).forEach((n,i)=>assert(Math.abs(n-offset[i])<.002));});
  const frozen=await camera(page);await page.waitForTimeout(250);same(frozen,await camera(page));
 }
 await reset(page);await page.getByRole('button',{name:'Open campus assistant'}).click();const input=page.locator('#campus-assistant-message');await input.waitFor({state:'visible'});assert.equal(await input.isDisabled(),false);await input.focus();const before=await camera(page);await page.keyboard.type('wasd WASD');await page.waitForTimeout(300);same(before,await camera(page));assert.equal(await input.inputValue(),'wasd WASD');
 check('WASD typing in the assistant never pans or consumes characters',()=>{});
 await close(page);await page.keyboard.down('w');await page.waitForTimeout(100);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const blur=await camera(page);await page.waitForTimeout(250);same(blur,await camera(page));await page.keyboard.up('w');check('Window blur clears held keys and prevents stuck travel',()=>{});
 await reset(page);let snapshot=await page.evaluate(()=>window.__map.snapshot());const stern=snapshot.landmarks.find(x=>x.id==='stern-school-of-business');
 check('Gould has one shared Stern root and no separate selectable entry',()=>{assert.equal(snapshot.landmarks.length,9);assert(!snapshot.landmarks.some(x=>x.id==='nyu-gould-plaza'));assert(stern.details.includesGouldPlaza);assert.equal(stern.parts.length,2);});
 assert.equal(await page.locator('option[value="nyu-gould-plaza"]').count(),0);
 const old=JSON.parse(await fs.readFile('evidence/m19-building-views/restored-zoom/browser-results.json','utf8')).initial.landmarks;
 for(const part of stern.parts){const id=part.name==='nyu-gould-plaza'?'nyu-gould-plaza':'stern-school-of-business',prior=old.find(x=>x.id===id);part.bounds.min.concat(part.bounds.max).forEach((n,i)=>assert(Math.abs(n-prior.bounds.min.concat(prior.bounds.max)[i])<.002));}
 check('Grouping preserves original Stern and plaza world-space geometry bounds',()=>{});
 // Actual raycast input across ground cells on the open plaza, projected with the live camera.
 const plaza=stern.parts.find(x=>x.name==='nyu-gould-plaza');let hit;
 for(const fx of [.25,.45,.6,.75]){
  for(const fz of [.2,.4,.6,.8]){
   const state=await camera(page),cam=new T.PerspectiveCamera(state.fov,1440/1000,state.near,state.far);cam.position.fromArray(state.position);cam.lookAt(new T.Vector3(...state.target));cam.updateMatrixWorld(true);
   const world=new T.Vector3(plaza.bounds.min[0]+(plaza.bounds.max[0]-plaza.bounds.min[0])*fx,1,plaza.bounds.min[2]+(plaza.bounds.max[2]-plaza.bounds.min[2])*fz),point=world.project(cam);
   const x=(point.x+1)*720,y=(1-point.y)*500;if(x<0||x>1440||y<0||y>1000)continue;
   await page.mouse.move(x,y);await page.waitForTimeout(180);if((await page.evaluate(()=>window.__map.snapshot())).hovered==='stern-school-of-business'){hit={x,y};break;}
  }if(hit)break;
 }
 assert(hit,'No actual plaza hover hit');await page.waitForTimeout(700);const lifted=(await page.evaluate(()=>window.__map.snapshot())).landmarks.find(x=>x.id===stern.id);
 check('Hover over plaza lifts both plaza and Stern together',()=>{const shifts=lifted.parts.map((part,i)=>part.bounds.min[1]-stern.parts[i].bounds.min[1]);assert(shifts[0]>3);assert(Math.abs(shifts[0]-shifts[1])<.01);});
 await page.mouse.click(hit.x,hit.y);await page.waitForTimeout(1300);snapshot=await page.evaluate(()=>window.__map.snapshot());assert.equal(snapshot.selected,'stern-school-of-business');check('Actual plaza click selects Stern',()=>{});
 await page.screenshot({path:`${out}/stern-with-gould-selected.png`});await context.close();
 const failed=await fixture(true);failed.release();await failed.page.waitForFunction(()=>document.querySelector('#app').dataset.state==='failed',null,{timeout:30000});assert(await failed.page.getByRole('button',{name:'Retry loading'}).isVisible());assert.equal(await failed.page.locator('#app').evaluate(x=>x.inert),true);await failed.page.screenshot({path:`${out}/startup-failure.png`});await failed.context.close();check('Actual asset failure denies automatic entry and keeps recoverable retry',()=>{});
 check('No uncaught JavaScript errors',()=>assert.deepEqual(errors,[]));
 await fs.writeFile(`${out}/map-input-browser-results.json`,JSON.stringify({checks,errors,plazaHit:hit,limitations:['Independent tester checks of M41 loader and current map interaction. Isolated installed Chrome; physical keyboard/touch not tested. API status mocked; no model/backend calls.']},null,2)+'\n');console.log(`${checks.length}/${checks.length} map startup/input/grouping Chrome checks passed`);
}finally{await browser.close();}
