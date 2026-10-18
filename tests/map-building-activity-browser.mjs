import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const url=process.env.MAP_URL||'http://127.0.0.1:4190';
const out='evidence/map-building-activity';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:2048,height:1187}});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const now=Date.now();
let payload={status:'ok',observedAt:new Date(now).toISOString(),upcoming:[],buildings:[{id:'bobst-library',name:'Bobst Library',people:Array.from({length:2},(_,i)=>({id:`synthetic-${i}`,displayName:`Person ${i+1}`,avatarUrl:null,status:'planned',validFrom:new Date(now-60000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),label:i?'studying':'project work'})),events:[{id:'synthetic-event',title:'Synthetic workshop',startsAt:new Date(now+3600000).toISOString(),endsAt:new Date(now+7200000).toISOString(),timeZone:'America/New_York',allDay:false,status:'confirmed',location:'Room 101',url:'https://example.com/event'}]},{id:'courant-institute',name:'Courant Institute',people:[],events:[]}]};
await page.route('**/api/map/presence',route=>payload==='error'?route.fulfill({status:503,json:{status:'unavailable',buildings:[]}}):route.fulfill({json:payload}));
const check=async(name,work)=>{const detail=await work();checks.push({name,pass:true,detail});console.log('PASS '+name);};
const card=page.locator('.map-presence__building-card');
const settleAvatars=async()=>page.evaluate(async()=>{let last=null,stable=0;for(let i=0;i<300;i++){await new Promise(requestAnimationFrame);const next=[...document.querySelectorAll('.map-presence__group[data-focused=true] .map-presence__person')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width];});const delta=last&&next.length===last.length?Math.max(0,...next.map((r,i)=>Math.hypot(...r.map((v,j)=>v-last[i][j])))):Infinity;stable=delta<.15?stable+1:0;if(stable>=8)return;last=next;}throw Error('Avatar motion did not settle');});
const focus=async id=>{await page.evaluate(id=>{window.__map.select(id);window.__map.focus();},id);await page.waitForTimeout(2200);};
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__map?.snapshot().status==='ready'&&document.querySelector('#app')?.dataset.state==='entered',null,{timeout:120000});
 await page.waitForFunction(()=>window.__map.presence.snapshot().status==='ok');
 await check('Overview has no activity card; focused building shows scheduled events and keeps current avatars',async()=>{
  assert(await card.isHidden());await focus('bobst-library');assert(await card.isVisible());
  assert.match(await card.textContent(),/Bobst Library.*Scheduled events.*Synthetic workshop.*Room 101/s);
  assert.equal(await page.locator('.map-presence__person').count(),2);assert.equal(await card.locator('.map-presence__roster-person').count(),0);
  assert.equal(await card.locator('a').getAttribute('href'),'https://example.com/event');
  const box=await card.boundingBox();assert(box.x>1024&&box.x+box.width<=2048);return {card:box};
 });
 await check('Desktop and tall focus keep avatars in a capped left region, stable through orbit and polling',async()=>{
  const results=[];
  for(const size of [{width:2048,height:1187},{width:1272,height:1522}]){
   await page.setViewportSize(size);await settleAvatars();
   const positions=await page.locator('.map-presence__group[data-focused=true] .map-presence__person').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
   assert.equal(positions.length,2);for(const r of positions){assert(r.x>=0&&r.x+r.w<=size.width*.44);assert(r.y>=0&&r.y+r.h<=size.height);}
   assert(Math.max(...positions.map(r=>r.x+r.w))-Math.min(...positions.map(r=>r.x))<=480);
   assert(Math.max(...positions.map(r=>r.y+r.h))-Math.min(...positions.map(r=>r.y))<=640);
   const before=positions;await page.evaluate(()=>window.__map.presence.refresh());await page.waitForTimeout(1000);
   await page.mouse.move(size.width*.49,200);await page.mouse.down();await page.mouse.move(size.width*.52,250,{steps:8});await page.mouse.up();await page.waitForTimeout(1200);
   const after=await page.locator('.map-presence__group[data-focused=true] .map-presence__person').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y};}));
   for(let i=0;i<2;i++)assert(Math.hypot(after[i].x-before[i].x,after[i].y-before[i].y)<2,JSON.stringify({before:before[i],after:after[i]}));
   await page.screenshot({path:`${out}/synthetic-${size.width}x${size.height}.png`});results.push({viewport:size,positions});
  }return results;
 });
 await check('Avatar selection switches to individual schedule; Escape restores building card',async()=>{
  await page.locator('.map-presence__group[data-focused=true] .map-presence__person').first().click();await page.waitForTimeout(1400);
  assert(await card.isHidden());const schedule=page.locator('.map-presence__itinerary:not(.map-presence__building-card)');assert(await schedule.isVisible());assert.match(await schedule.textContent(),/Person 1.*Schedule/s);
  await page.keyboard.press('Escape');await page.waitForTimeout(500);assert(await card.isVisible());assert(await schedule.isHidden());return {individualPreserved:true};
 });
 await check('Empty buildings retain their event card; unavailable reads show failure text',async()=>{
  await focus('courant-institute');assert(await card.isVisible());assert.match(await card.textContent(),/Courant Institute.*Scheduled events.*No scheduled events recorded/s);
  payload='error';await page.evaluate(()=>window.__map.presence.refresh());await page.waitForTimeout(200);assert.match(await card.textContent(),/Events are unavailable/s);assert.equal(await page.locator('.map-presence__person').count(),0);return {emptyAndFailure:true};
 });
 await check('Narrow focus card remains inside viewport and scrolls without page overflow',async()=>{
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);const box=await card.boundingBox();assert(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.screenshot({path:out+'/synthetic-mobile.png'});return {card:box};
 });
 assert.deepEqual(errors,[]);
 await fs.writeFile(out+'/report.json',JSON.stringify({url,browser:browser.version(),checks,errors,limitations:['Synthetic initial portraits and event only; no live person/event details in evidence.','Headless software WebGL and emulated viewport; direct checks, no independent subagent.']},null,2)+'\n');
}finally{await context.close();await browser.close();}
