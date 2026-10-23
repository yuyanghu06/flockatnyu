import {normalizeCalendarBoundary,validCalendarInstant} from '../../server/google/calendar-client.js';

const text=maxLength=>({type:'string',maxLength});
export const batchBoundarySchema={type:'object',additionalProperties:false,properties:{date:text(10),dateTime:text(40),timeZone:text(100)},required:[]};
export const batchTimingProperties={date:{...text(10),minLength:10,description:'All-day date if alone; local timed date with startTime/endTime/timeZone. Never omit supplied clock times.'},start:batchBoundarySchema,end:batchBoundarySchema,
  startTime:{...text(5),minLength:5,description:'Local HH:MM; requires date, endTime and timeZone.'},endTime:{...text(5),minLength:5},timeZone:{...text(100),minLength:1}};
export const batchDateValid=value=>typeof value==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)&&value.slice(0,4)!=='0000'
  &&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export const batchNextDate=value=>new Date(Date.parse(value+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const formatters=new Map();
function formatter(zone) {
  if(typeof zone!=='string'||!zone||zone.length>100)throw Error('invalid_time_zone');
  if(!formatters.has(zone)) {
    const value=new Intl.DateTimeFormat('en-GB',{timeZone:zone,calendar:'iso8601',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    if(formatters.size>=32)formatters.delete(formatters.keys().next().value);
    formatters.set(zone,value);
  }
  return formatters.get(zone);
}
function localText(instant,zone) {
  const p=Object.fromEntries(formatter(zone).formatToParts(new Date(instant)).map(part=>[part.type,part.value]));
  return `${p.year.padStart(4,'0')}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
function localBoundary(date,clock,zone) {
  if(typeof clock!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(clock))throw Error('invalid_local_time');
  const expected=`${date}T${clock}:00`,nominal=Date.parse(expected+'Z'),offsets=new Set();
  // Observe the offsets surrounding this civil time, then verify each inverse.
  // Gap times have no solution; repeated DST times have two and must be explicit.
  for(let hours=-36;hours<=36;hours+=6) {
    const sample=nominal+hours*3600000;
    offsets.add(Date.parse(localText(sample,zone)+'Z')-sample);
  }
  const matches=[...offsets].map(offset=>nominal-offset).filter(candidate=>localText(candidate,zone)===expected);
  if(matches.length!==1)throw Error(matches.length?'ambiguous_local_time':'nonexistent_local_time');
  return {dateTime:new Date(matches[0]).toISOString(),timeZone:zone};
}
function boundary(value,observed=false) {
  if(observed&&value?.timeZone===null&&validCalendarInstant(value.dateTime)&&Object.keys(value).every(key=>['dateTime','timeZone'].includes(key)))return {dateTime:new Date(value.dateTime).toISOString(),timeZone:null};
  const result=normalizeCalendarBoundary(value);
  if(result.date&&!batchDateValid(result.date))throw Error('invalid_event');
  return result;
}
export function validateBatchTiming(value,observed=false) {
  const start=boundary(value.start,observed),end=boundary(value.end,observed);
  if(Boolean(start.date)!==Boolean(end.date)||Date.parse(end.date||end.dateTime)<=Date.parse(start.date||start.dateTime))throw Error('invalid_event');
  return {start,end};
}
export function normalizeBatchTiming(value,required=false) {
  const compact=['startTime','endTime','timeZone'].some(key=>value[key]!==undefined);
  if(value.date!==undefined||compact) {
    if(value.start!==undefined||value.end!==undefined||!batchDateValid(value.date))throw Error('invalid_event');
    if(compact) {
      if(!['startTime','endTime','timeZone'].every(key=>value[key]!==undefined))throw Error('invalid_event');
      return validateBatchTiming({start:localBoundary(value.date,value.startTime,value.timeZone),end:localBoundary(value.date,value.endTime,value.timeZone)});
    }
    const end=batchNextDate(value.date);if(!batchDateValid(end))throw Error('invalid_event');
    return {start:{date:value.date},end:{date:end}};
  }
  if(required||value.start!==undefined&&value.end!==undefined)return validateBatchTiming(value);
  return {...(value.start!==undefined?{start:boundary(value.start)}:{}),...(value.end!==undefined?{end:boundary(value.end)}:{})};
}
export function batchTimingFields(value) {
  const timing=validateBatchTiming(value,true);
  return {...timing,...(timing.start.date?{date:timing.start.date}:{timeZone:timing.start.timeZone})};
}
export function savedBatchTimingFields(value) {
  try {return batchTimingFields(value);} catch {return {};}
}
export const batchLocalDate=value=>value.start.date||localText(Date.parse(value.start.dateTime),value.start.timeZone).slice(0,10);
