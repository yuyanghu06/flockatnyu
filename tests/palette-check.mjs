import {chromium} from 'playwright-core';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1150}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173/docs/color-schemes.html');
await page.waitForFunction(()=>document.querySelector('.scene img')?.naturalWidth>0);
const checks=[];
for(const theme of ['graphite','daylight','dusk']){await page.click(`[data-theme=${theme}]`);checks.push({theme,pressed:await page.getAttribute(`[data-theme=${theme}]`,'aria-pressed'),swatches:await page.locator('.swatch').count()});await page.screenshot({path:`evidence/m3-campus-details/color-scheme-${theme}.png`,fullPage:true});}
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'evidence/m3-campus-details/color-scheme-mobile.png',fullPage:true});
checks.push({mobileWidth:await page.evaluate(()=>document.documentElement.scrollWidth),notesStatus:(await page.request.get(new URL(await page.locator('#token-notes').getAttribute('href'),page.url()).href)).status()});
fs.writeFileSync('evidence/m3-campus-details/color-scheme-results.json',JSON.stringify({checks,errors},null,2));console.log({checks,errors});await browser.close();

