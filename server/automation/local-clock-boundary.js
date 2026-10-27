import {canonicalTimeZone} from "../shared/time-zone.js";
import {canonicalJson,plainObject} from './validation.js';

const invalid=()=>{throw Error('invalid_request');};
const date=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value)&&value.slice(0,4)!=='0000'
  &&Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const instant=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
  &&date(value.slice(0,10))&&Number.isFinite(Date.parse(value));

// Pure worker input conversion. IANA rules, not model-provided offsets, decide
// the instant. Multiple candidates (a fold) and no candidate (a gap) both deny.
export function normalizeMemberPlanBoundary(value,{currentBoundary}={}) {
  if(value===undefined)return undefined;
  if(!plainObject(value))invalid();
  const keys=Object.keys(value).sort().join(',');
  if(keys==='date'&&date(value.date))return {...value};
  if(keys==='dateTime,timeZone') {
    if(!instant(value.dateTime)||typeof value.timeZone!=='string'||!canonicalTimeZone(value.timeZone)||!plainObject(currentBoundary)
      ||canonicalJson(value)!==canonicalJson(currentBoundary))invalid();
    return {...value};
  }
  if(keys!=='localDateTime,timeZone'||typeof value.localDateTime!=='string'
    ||!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/.test(value.localDateTime)
    ||!date(value.localDateTime.slice(0,10)))invalid();
  const zone=typeof value.timeZone==='string'&&canonicalTimeZone(value.timeZone);if(!zone)invalid();
  const nominal=Date.parse(`${value.localDateTime}Z`),fraction=nominal%1000;
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,calendar:'iso8601',numberingSystem:'latn',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const local=at=>{
    const p=Object.fromEntries(formatter.formatToParts(new Date(at)).map(part=>[part.type,part.value]));
    return `${p.year.padStart(4,'0')}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  };
  const offsets=new Set();
  // Observe both sides of any nearby IANA transition, including non-hour and
  // date-line changes; then require exact local round trips for every candidate.
  for(let hours=-36;hours<=36;hours+=3) {
    const probe=Math.floor((nominal+hours*3600000)/1000)*1000;
    offsets.add(Date.parse(`${local(probe)}Z`)-probe);
  }
  const wanted=value.localDateTime.slice(0,19),candidates=[];
  for(const offset of offsets) {
    const at=nominal-offset;
    if(Number.isFinite(at)&&local(at)===wanted&&((at%1000)+1000)%1000===((fraction%1000)+1000)%1000)candidates.push(at);
  }
  if(candidates.length!==1)invalid();
  return {dateTime:new Date(candidates[0]).toISOString(),timeZone:zone};
}
