import test from 'node:test';
import assert from 'node:assert/strict';
import {withLocalTimeDisplay} from '../server/automation/local-time-display.js';

const freeze=value=>{if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
const event=(dateTime,timeZone)=>({eventId:'opaque-provider_ID==',url:'https://calendar.google.com/calendar/event?eid=AbC_-x%2F%3D&ctz=America%2FNew_York',title:'Human title',description:'Preserve human notes',start:{dateTime,...(timeZone===undefined?{}:{timeZone})},end:{dateTime,...(timeZone===undefined?{}:{timeZone})},details:{attendees:['opaque@example.test'],nested:{flag:true}}});
const display=(result,index=0)=>result.events[index].localTimeDisplay;
const stripDisplay=result=>({...result,events:result.events.map(({localTimeDisplay,...row})=>row)});

for(const [name,instant,zone,expected] of [
 ['New York summer','2026-07-10T19:00:00Z','America/New_York','2026-07-10T15:00:00-04:00'],
 ['New York winter','2026-01-10T19:00:00Z','America/New_York','2026-01-10T14:00:00-05:00'],
 ['positive half-hour offset','2026-07-10T19:00:00Z','Asia/Kolkata','2026-07-11T00:30:00+05:30'],
 ['positive quarter-hour offset','2026-07-10T19:00:00Z','Asia/Kathmandu','2026-07-11T00:45:00+05:45'],
 ['negative half-hour offset','2026-01-10T19:00:00Z','America/St_Johns','2026-01-10T15:30:00-03:30'],
 ['prior-day rollover','2026-01-11T02:30:00Z','America/Los_Angeles','2026-01-10T18:30:00-08:00'],
 ['next-day rollover','2026-07-10T23:30:00Z','Asia/Tokyo','2026-07-11T08:30:00+09:00'],
 ['explicit offset input represents the same instant','2026-07-10T15:00:00-04:00','America/New_York','2026-07-10T15:00:00-04:00'],
 ['fractional instant','2026-07-10T19:00:00.123456Z','America/New_York','2026-07-10T15:00:00.123456-04:00'],
 ['fractional instant near second edge','2026-01-10T19:00:59.999999Z','Asia/Kathmandu','2026-01-11T00:45:59.999999+05:45'],
])test('worker local display: '+name+' is derived without rewriting raw facts',()=>{
 const input=freeze({status:'ready',coverage:{complete:true,returnedCount:1},events:[event(instant,zone)],cursor:'opaque-cursor'}),before=structuredClone(input);
 const output=withLocalTimeDisplay(input),hint=display(output);
 assert.equal(hint.basis,'derived_display_only');assert.equal(hint.start.dateTime,expected);assert.equal(hint.end.dateTime,expected);assert.equal(hint.start.localDate,expected.slice(0,10));assert.equal(hint.start.localTime,expected.slice(11,-6));assert.equal(hint.start.utcOffset,expected.slice(-6));assert.equal(Date.parse(hint.start.dateTime),Date.parse(instant));
 assert.deepEqual(stripDisplay(output),before);assert.deepEqual(input,before);assert.equal(output.events[0].start.dateTime,instant);
});

test('worker local display: DST fold derives each endpoint own offset and preserves elapsed hour',()=>{
 const row=event('2026-11-01T05:30:00.125Z','America/New_York');row.end.dateTime='2026-11-01T06:30:00.125Z';const input=freeze({status:'partial',coverage:{complete:false,reason:'page_limit'},events:[row]});
 const result=withLocalTimeDisplay(input),hint=display(result);assert.equal(hint.start.dateTime,'2026-11-01T01:30:00.125-04:00');assert.equal(hint.end.dateTime,'2026-11-01T01:30:00.125-05:00');assert.equal(Date.parse(hint.end.dateTime)-Date.parse(hint.start.dateTime),3600000);assert.deepEqual(stripDisplay(result),input);
});

test('worker local display: UTC midnight and microseconds retain fractional spelling',()=>{
 const row=event('2026-07-10T00:00:00.000001Z','UTC'),result=withLocalTimeDisplay({status:'ready',events:[row]});assert.equal(display(result).start.dateTime,'2026-07-10T00:00:00.000001+00:00');assert.equal(result.events[0].start.dateTime,row.start.dateTime);
});

for(const [name,row] of [
 ['missing explicit zone',event('2026-07-10T19:00:00Z')],
 ['invalid explicit zone',event('2026-07-10T19:00:00Z','Atlantis/Nowhere')],
 ['invalid instant',event('not-an-instant','America/New_York')],
 ['all-day dates',{...event('2026-07-10T19:00:00Z','America/New_York'),start:{date:'2026-07-10',timeZone:'America/New_York'},end:{date:'2026-07-11',timeZone:'America/New_York'}}],
 ['mixed all-day endpoint',{...event('2026-07-10T19:00:00Z','America/New_York'),end:{date:'2026-07-11'}}],
])test('worker local display: '+name+' creates no unsupported hint',()=>{
 const input=freeze({status:'ready',coverage:{complete:false},events:[row]}),output=withLocalTimeDisplay(input);assert(!Object.hasOwn(output.events[0],'localTimeDisplay'));assert.deepEqual(output,input);
});

test('worker local display: one boundary never supplies a missing or invalid zone to the other',()=>{
 const row=event('2026-07-10T19:00:00Z','America/New_York');delete row.start.timeZone;row.timeZone='America/New_York';const input=freeze({status:'ready',events:[row]}),output=withLocalTimeDisplay(input);assert(!display(output).start);assert.equal(display(output).end.dateTime,'2026-07-10T15:00:00-04:00');assert.deepEqual(stripDisplay(output),input);
 const next=structuredClone(row);next.start.timeZone='Atlantis/Nowhere';assert(!display(withLocalTimeDisplay({status:'ready',events:[next]})).start);
});

for(const input of [{status:'unavailable',events:[event('2026-07-10T19:00:00Z','America/New_York')]},{status:'ready',events:null},null])test('worker local display: non-event/failed result remains unchanged '+String(input?.status),()=>{
 assert.deepEqual(withLocalTimeDisplay(freeze(input)),input);
});
