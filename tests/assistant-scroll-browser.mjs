import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const baseUrl=process.env.MAP_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__scroll_check',r=>r.fulfill({contentType:'text/html',body:`<html><body><script type="module">import{createAssistant}from'/src/assistant.js';import'/src/assistant.css';const encoder=new TextEncoder();window.fetch=async(url,options)=>{if(url==='/api/status')return Response.json({chat:{configured:true},access:{allowed:true}});return new Response(new ReadableStream({start(c){const send=e=>c.enqueue(encoder.encode(JSON.stringify(e)+'\\n'));send({type:'tool',id:'tool-1',name:'list_calendar_events',status:'running'});setTimeout(()=>{send({type:'tool',id:'tool-1',name:'list_calendar_events',status:'completed'});send({type:'delta',text:'**This week**\\n\\n'+('A synthetic event with a useful description. '.repeat(5))});},160);setTimeout(()=>{send({type:'delta',text:'\\n\\n- First detail\\n- Second detail'});send({type:'done'});c.close();},340);}}),{headers:{'Content-Type':'application/x-ndjson'}});};window.ui=createAssistant();document.dispatchEvent(new Event('campus-enter'));</script></body></html>`}));
 for(const size of [{width:1280,height:844},{width:390,height:844},{width:390,height:480}]){
  await page.setViewportSize(size);await page.goto(baseUrl+'/__scroll_check');await page.getByRole('button',{name:'Open campus assistant'}).click();await page.waitForTimeout(400);await page.waitForFunction(()=>document.querySelector('.assistant-service').dataset.connected==='true');
  const turns=[];
  for(let turn=0;turn<4;turn++){
   const result=await page.evaluate(async turn=>{const panel=document.querySelector('.assistant-panel'),transcript=document.querySelector('.assistant-transcript'),input=document.querySelector('textarea');input.value=turn===3?'Long wrapped question about this week and the calendar. '.repeat(8):'What about this week?';input.dispatchEvent(new Event('input'));document.querySelector('form').requestSubmit();const frames=[];for(let frame=0;frame<65;frame++){await new Promise(requestAnimationFrame);if(frame<24)continue;const reply=transcript.querySelector('.assistant-assistant:last-child'),p=panel.getBoundingClientRect(),t=transcript.getBoundingClientRect(),r=reply.getBoundingClientRect();frames.push({clearance:Math.min(p.bottom,t.bottom)-r.bottom,scrollGap:transcript.scrollHeight-transcript.clientHeight-transcript.scrollTop});}return {minClearance:Math.min(...frames.map(f=>f.clearance)),maxScrollGap:Math.max(...frames.map(f=>f.scrollGap)),last:frames.at(-1)};},turn);
   assert(result.minClearance>=20,JSON.stringify({size,turn,...result}));assert(result.maxScrollGap<2,JSON.stringify({size,turn,...result}));turns.push(result);
  }
  // The scrollport must stop above the inset edge even when a bubble crosses
  // its cutoff, rather than relying on padding at the end of the message list.
  for(const fraction of [0,.35,.7,1]){
   const gutter=await page.locator('.assistant-transcript').evaluate((e,fraction)=>{e.scrollTop=(e.scrollHeight-e.clientHeight)*fraction;return e.closest('.assistant-panel').getBoundingClientRect().bottom-e.getBoundingClientRect().bottom;},fraction);
   assert(gutter>=17.5,JSON.stringify({size,fraction,gutter}));
   if(fraction===.7)await page.screenshot({path:`/tmp/flock-transcript-cutoff-${size.width}x${size.height}.png`});
  }
  await page.locator('.assistant-transcript').evaluate(e=>e.scrollTop=0);await page.waitForTimeout(150);assert.equal(await page.locator('.assistant-transcript').evaluate(e=>e.scrollTop),0);
  await page.locator('.assistant-transcript').evaluate(e=>e.scrollTop=e.scrollHeight);await page.locator('textarea').fill('Another long question that wraps as the composer grows. '.repeat(8));await page.waitForTimeout(400);assert(await page.locator('.assistant-transcript').evaluate(e=>e.scrollHeight-e.clientHeight-e.scrollTop)<2);await page.locator('textarea').fill('short');await page.waitForTimeout(400);assert(await page.locator('.assistant-transcript').evaluate(e=>e.scrollHeight-e.clientHeight-e.scrollTop)<2);await page.screenshot({path:`/tmp/flock-unclipped-${size.width}x${size.height}.png`});console.log(JSON.stringify({size,turns,manualScrollRetained:true}));
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
