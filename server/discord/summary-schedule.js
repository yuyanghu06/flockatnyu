const zone='America/New_York';
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const modes=new Set(['bootstrap','weekly','monthly','scheduled']);
export function normalizeDiscordSummaryAsOf(value) {
  if(!(value instanceof Date)&&typeof value!=='string'&&typeof value!=='number')return null;
  if(typeof value==='string') {
    const match=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?(Z|[+-]\d\d:\d\d)$/.exec(value);
    if(!match)return null;
    const [year,month,day,hour,minute,second]=match.slice(1,7).map(Number);
    const leap=year%4===0&&(year%100!==0||year%400===0);
    const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59)return null;
    if(match[8]!=='Z'){const [offsetHour,offsetMinute]=match[8].slice(1).split(':').map(Number);if(offsetHour>23||offsetMinute>59)return null;}
  }
  const instant=new Date(value);
  return Number.isFinite(instant.getTime())?instant.toISOString():null;
}
export function getDiscordCalendarWeekStart({now=new Date()}={}) {
  const normalized=normalizeDiscordSummaryAsOf(typeof now==='function'?now():now);
  if(!normalized)return null;
  const parts=Object.fromEntries(formatter.formatToParts(new Date(normalized)).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
  const weekday=(new Date(Date.UTC(parts.year,parts.month-1,parts.day)).getUTCDay()+6)%7;
  const localTarget=Date.UTC(parts.year,parts.month-1,parts.day-weekday);
  // Solve the target local midnight using that Monday's offset, rather than
  // subtracting168 hours or reusing today's offset across a DST transition.
  let candidate=localTarget+5*3600000;
  for(let attempt=0;attempt<4;attempt++) {
    const p=Object.fromEntries(formatter.formatToParts(new Date(candidate)).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
    const delta=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute)-localTarget;
    candidate-=delta;if(!delta)break;
  }
  return new Date(candidate).toISOString();
}
export function getDiscordSummarySchedule({now=new Date(),mode='scheduled'}={}) {
  const normalized=normalizeDiscordSummaryAsOf(typeof now==='function'?now():now);
  if(!normalized||!modes.has(mode))return {status:'invalid_request',timezone:zone};
  const instant=new Date(normalized);
  const p=Object.fromEntries(formatter.formatToParts(instant).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  const localDate=`${p.year}-${p.month}-${p.day}`;
  const calendarDate=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day)));
  const previousMonth=new Date(Date.UTC(Number(p.year),Number(p.month)-2,1)).toISOString().slice(0,7);
  let asOf=instant.toISOString();
  let base={asOf,timezone:zone,localDate};
  if(mode==='scheduled') {
    if(p.hour!=='08')return {...base,status:'not_due'};
    // A delayed cron startup during the 08:00 hour uses the same 08:00 cutoff.
    asOf=new Date(Math.floor(instant.getTime()/3600000)*3600000).toISOString();
    base={...base,asOf};
    // Closing the prior calendar month takes precedence on Monday the first.
    if(p.day==='01')mode='monthly';
    else if(calendarDate.getUTCDay()===1)mode='weekly';
    else return {...base,status:'not_due'};
  }
  const dueIdentity=mode==='monthly'?`monthly:${previousMonth}`:mode==='weekly'?`weekly:${localDate}`:`bootstrap:${asOf}`;
  const currentWeekStart=getDiscordCalendarWeekStart({now:asOf});
  return {...base,status:'due',mode,dueIdentity,currentWeekStart,weeklyRawCutoff:currentWeekStart,monthlyPeriod:previousMonth};
}
