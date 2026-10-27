// Independent local Chrome/Hono acceptance; no source, model or hosted writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {serve} from '@hono/node-server';
import {chromium} from 'playwright-core';
import {createApp} from '../server/runtime/app.js';
import {readConfig} from '../server/shared/config.js';
import {createBugReportTools} from '../tools/bug-reports/index.js';

const directory=new URL('../evidence/chat-production-fixes/',import.meta.url);
await mkdir(directory,{recursive:true});
const vite=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error'});
await vite.listen();const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
const observations=[],reports=[],received=[],memory=[];
let round=0,release,fail=false,reportFails=false;
const config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'fixture',LLM_API_KEY:'fixture-only'});
const report=summary=>({name:'bug_reports',arguments:{summary,observedBehavior:'The user reports a broken composer.'}});
const app=createApp({config,auth:()=>({id:'local-test',allowedSourceIds:[]}),bugReportTools:createBugReportTools({store:{configured:true,record:async({reportId})=>{
  reports.push(reportId);return reportFails?{status:'conflict'}:{status:'ready',reportId,createdAt:'2026-10-18T22:00:00Z',outcome:'created'};
}}}),memoryTools:{tools:[{name:'update_memory'}],execute:async()=>{memory.push(true);return {status:'ready',outcome:'updated',memory:{updated_at:'2026-10-18T22:00:00Z'}};}},provider:{
  planTools:async()=>round++===0?[report('Broken composer'),report('Reworded report')]:round===2?[report('Third report attempt'),{name:'update_memory',arguments:{content:'Supplied club preference'}}]:[],
  async *stream({messages}){received.push(messages);await new Promise(resolve=>{release=resolve;});if(fail)throw Error('PRIVATE_FAILURE');yield 'Files received and the request finished while minimized.';},
}});
const server=serve({hostname:'127.0.0.1',port:0,fetch:request=>new URL(request.url).pathname.startsWith('/api/')?app.fetch(request):fetch(base+new URL(request.url).pathname+new URL(request.url).search)});
await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
let browser;
try {
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/__production_check',route=>route.fulfill({contentType:'text/html',body:'<html><body><script type="module">import {createAssistant} from "/src/features/assistant/assistant.js";import "/src/features/assistant/assistant.css";window.ui=createAssistant();document.dispatchEvent(new Event("campus-enter"));</script></body></html>'}));
  for(const width of [1280,390]){
    round=0;release=null;fail=false;reportFails=width===390;
    await page.setViewportSize({width,height:900});await page.goto(`http://127.0.0.1:${server.address().port}/__production_check`);
    await page.getByRole('button',{name:'Open campus assistant'}).click();
    const picker=page.locator('input[type=file]'),input=page.locator('textarea');
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Attach files',exact:true}).click();
    await (await chooser).setFiles([{name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic notes 🌱')},{name:'remove-me.txt',mimeType:'text/plain',buffer:Buffer.from('Remove this')}]);
    await page.getByRole('button',{name:'Remove remove-me.txt'}).click();
    await input.fill('The composer is broken; remember our supplied club preference.');
    const reportCount=reports.length,memoryCount=memory.length;await page.getByRole('button',{name:'Send message'}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.assistant-tool[data-status="completed"],.assistant-tool[data-status="failed"]').length===2);
    assert.equal(await page.locator('.assistant-tool').count(),2,'Exactly one bug and one memory row must remain');
    assert.equal(reports.length-reportCount,1);assert.equal(memory.length-memoryCount,1);
    const reportRow=page.locator('.assistant-tool').filter({hasText:'bug reports'});assert.equal(await reportRow.count(),1);assert.equal(await reportRow.getAttribute('data-status'),reportFails?'failed':'completed');
    assert.deepEqual(received.at(-1).at(-1).attachments.map(file=>file.name),['notes.txt']);
    await input.fill('Keep this next draft');
    await picker.setInputFiles([{name:'next-draft.txt',mimeType:'text/plain',buffer:Buffer.from('Next draft only')}]);
    await page.getByRole('button',{name:'Remove next-draft.txt'}).waitFor();
    await page.waitForTimeout(550);await page.screenshot({path:new URL(`streaming-${width}.png`,directory).pathname});
    await page.getByRole('button',{name:'Close assistant'}).click();await page.locator('dialog').waitFor({state:'hidden'});
    release();await page.waitForFunction(()=>document.querySelector('.assistant-announcement').textContent==='Reply complete.');
    await page.getByRole('button',{name:'Open campus assistant'}).click();
    assert.equal(await input.inputValue(),'Keep this next draft');await page.getByRole('button',{name:'Remove next-draft.txt'}).waitFor();
    assert.match(await page.locator('.assistant-assistant').last().innerText(),/request finished while minimized/);
    await page.waitForTimeout(550);await page.screenshot({path:new URL(`completed-${width}.png`,directory).pathname});
    // A later provider failure must preserve a draft the user already started.
    round=0;release=null;fail=true;await page.getByRole('button',{name:'Send message'}).click();
    await page.waitForFunction(()=>document.querySelector('.assistant-tool[data-status="running"]')===null&&document.querySelector('.assistant-announcement').textContent==='Assistant is responding…');
    await input.fill('Do not overwrite my replacement draft');
    await picker.setInputFiles([{name:'replacement.txt',mimeType:'text/plain',buffer:Buffer.from('Replacement draft')}]);
    await page.getByRole('button',{name:'Remove replacement.txt'}).waitFor();
    release();await page.waitForFunction(()=>document.querySelector('.assistant-announcement').textContent==='The reply could not finish.');
    assert.equal(await input.inputValue(),'Do not overwrite my replacement draft');assert.equal(await page.getByRole('button',{name:'Remove replacement.txt'}).count(),1);
    assert(!(await page.locator('dialog').innerText()).includes('PRIVATE_FAILURE'));
    const geometry=await page.locator('dialog').evaluate(element=>({width:element.getBoundingClientRect().width,client:element.clientWidth,scroll:element.scrollWidth}));
    assert(geometry.width<=width);assert(geometry.scroll<=geometry.client);
    observations.push({width,oncePerMessage:true,reportStatus:reportFails?'failed':'completed',memoryContinues:true,pickerAndRemove:true,attachmentRequest:true,hiddenCompletion:true,nextDraftSurvivesCompletionAndFailure:true,boundedLayout:true});
    console.log(JSON.stringify(observations.at(-1)));
  }
  await page.route('**/__map_refresh_check',route=>route.fulfill({contentType:'text/html',body:`<html><body><div id="app" data-state="entered" style="width:1200px;height:800px"></div><script type="module">
    import {createMapPresence} from '/src/map/presence/map-presence.js';import {PerspectiveCamera} from '/node_modules/three/build/three.module.js';
    const container=document.querySelector('#app');window.mapReads=0;
    const payload=attendees=>({status:'ok',observedAt:new Date().toISOString(),upcoming:[],buildings:[{id:'bobst-library',name:'Bobst Library',people:[],events:[{id:'synthetic-aws',title:'AWS Workshop',startsAt:new Date(Date.now()+3600000).toISOString(),endsAt:new Date(Date.now()+7200000).toISOString(),timeZone:'America/New_York',allDay:false,status:'confirmed',location:'Room 101',attendees}]}]});
    window.presence=createMapPresence({container,camera:new PerspectiveCamera(),renderer:{},getRoot:()=>null,getFocusedBuilding:()=> 'bobst-library',selectBuilding(){},focusBuilding(){},fetchImpl:async()=>{
      window.mapReads++;
      if(window.mapReads===1)return await new Promise(resolve=>{window.releaseStale=()=>resolve(Response.json(payload([])));});
      return Response.json(payload([{id:'synthetic-yuyang',displayName:'Yuyang Hu',avatarUrl:null}]));
    }});
  </script></body></html>`}));
  await page.goto(`http://127.0.0.1:${server.address().port}/__map_refresh_check`);
  await page.waitForFunction(()=>typeof window.releaseStale==='function');
  await page.evaluate(()=>{document.dispatchEvent(new CustomEvent('campus-map-updated'));window.releaseStale();});
  await page.waitForFunction(()=>window.presence.snapshot().status==='ok');
  await page.waitForTimeout(400);
  assert(await page.evaluate(()=>window.mapReads>=2),'Attendance refresh during a stale poll must queue a new read');
  await page.locator('[aria-label="Yuyang Hu"]').waitFor();
  observations.push({mapRefreshWhilePolling:true,freshAttendanceVisible:true});
  await page.evaluate(()=>window.presence.dispose());
  assert.deepEqual(errors,[]);
  await writeFile(new URL('browser-acceptance.json',directory),JSON.stringify({mode:'local synthetic Hono + actual Chrome UI; no real model/source calls',observations,pageErrors:errors},null,2)+'\n');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));await vite.close();}
