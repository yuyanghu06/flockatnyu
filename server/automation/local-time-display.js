import {canonicalTimeZone,createTimeContext} from "../shared/time-zone.js";
import {timestamp} from '../map/events.js';
import {plainObject} from './validation.js';

function localBoundary(boundary) {
  if(!plainObject(boundary)||boundary.date!==undefined||typeof boundary.timeZone!=='string'
    ||!canonicalTimeZone(boundary.timeZone)||timestamp(boundary.dateTime)===null)return null;
  const instant=timestamp(boundary.dateTime),context=createTimeContext({timeZone:boundary.timeZone,now:boundary.dateTime});
  if(!context)return null;
  // Compare whole seconds, not a fractional instant against second-only local
  // parts. Each endpoint gets its own actual offset, including across DST.
  const offsetMinutes=(Date.parse(`${context.localDateTime}Z`)-Math.floor(instant/1000)*1000)/60000;
  if(!Number.isSafeInteger(offsetMinutes)||Math.abs(offsetMinutes)>900)return null;
  const absolute=Math.abs(offsetMinutes),utcOffset=`${offsetMinutes<0?'-':'+'}${String(Math.floor(absolute/60)).padStart(2,'0')}:${String(absolute%60).padStart(2,'0')}`;
  const fraction=/\.(\d{1,6})(?:Z|[+-])/.exec(boundary.dateTime)?.[1];
  const localTime=context.localDateTime.slice(11)+(fraction?`.${fraction}`:'');
  const dateTime=`${context.localDate}T${localTime}${utcOffset}`;
  if(timestamp(dateTime)!==instant)return null;
  return {dateTime,localDate:context.localDate,localTime,utcOffset,timeZone:context.timeZone};
}

// Worker read-result presentation only. These values describe returned instants;
// they are neither source intent nor writable boundary replacements.
export function withLocalTimeDisplay(result) {
  if(!plainObject(result)||!['ready','partial'].includes(result.status)||!Array.isArray(result.events))return result;
  return {...result,events:result.events.map(event=>{
    if(!plainObject(event)||event.start?.date!==undefined||event.end?.date!==undefined)return event;
    const start=localBoundary(event.start),end=localBoundary(event.end);
    return start||end?{...event,localTimeDisplay:{basis:'derived_display_only',...(start?{start}:{}),...(end?{end}:{})}}:event;
  })};
}
