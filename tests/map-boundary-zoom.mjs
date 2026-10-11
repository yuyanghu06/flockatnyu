import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const out=process.env.MAP_EVIDENCE??'evidence/m3-campus-details',report={};
try{
 await page.goto(process.env.MAP_URL??'http://127.0.0.1:4173');await page.waitForFunction(()=>window.__map?.snapshot().status==='ready');
 const initial=await page.evaluate(()=>window.__map.snapshot());
 const target=[430,12,650],direction=initial.camera.position.map((v,i)=>(v-initial.camera.target[i])/240.97521330083552);
 const c={...initial.camera,target,position:target.map((v,i)=>v+direction[i]*700)};
 await page.click('#camera-open');await page.fill('#camera-json',JSON.stringify(c));await page.click('#camera-restore');assert.equal(await page.locator('#camera-message').textContent(),'Saved angle restored.');await page.locator('#camera-dialog .close').click();
 await page.mouse.move(720,500);await page.mouse.wheel(0,100000);await page.waitForTimeout(600);
 report.southEast=await page.evaluate(()=>window.__map.snapshot());
 const camera=report.southEast.camera,distance=Math.hypot(...camera.position.map((v,i)=>v-camera.target[i]));assert.ok(Math.abs(distance-700)<1e-6);assert.ok(camera.target[0]<=430+1e-8&&camera.target[2]<=650+1e-8);
 await page.screenshot({path:`${out}/boundary-max-zoom.png`});
 await page.mouse.move(1000,450);await page.mouse.down();await page.mouse.move(1200,520,{steps:15});await page.mouse.up();await page.waitForTimeout(600);
 report.orbited=await page.evaluate(()=>window.__map.snapshot());assert.notDeepEqual(report.orbited.camera.position,camera.position);assert.ok(Math.abs(Math.hypot(...report.orbited.camera.position.map((v,i)=>v-report.orbited.camera.target[i]))-700)<1e-6);
 await page.screenshot({path:`${out}/boundary-max-zoom-orbited.png`});
}catch(e){report.error=e.stack;}
await browser.close();fs.writeFileSync(`${out}/boundary-zoom-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.error)process.exitCode=1;
