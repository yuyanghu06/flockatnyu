// Historical migration verification only; never import from production.
// Calendar boundaries are New York boundaries; the recent window is 168 elapsed
// hours, including across DST. Buckets contain originals, never AI summaries.
const zone = 'America/New_York';
const day = 86400000;
const format = new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const instant = value => { const d = new Date(value); if (!Number.isFinite(d.getTime())) throw new TypeError('Invalid memory timestamp'); return d; };
function parts(value) { return Object.fromEntries(format.formatToParts(value).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)])); }
function localMidnight(year,month,date) {
  const target = Date.UTC(year,month-1,date), normalized = new Date(target);
  let result = target;
  for (let i=0;i<4;i++) {
    const p=parts(new Date(result));
    const delta=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    result+=delta; if (!delta) break;
  }
  // Date.UTC normalization also handles next month and previous week dates.
  if (!Number.isFinite(normalized.getTime())) throw new TypeError('Invalid calendar date');
  return result;
}
export function getDiscordMemoryBoundaries({now = new Date()} = {}) {
  const asOf=instant(now), p=parts(asOf);
  return {asOf:asOf.toISOString(),recentFrom:new Date(asOf.getTime()-7*day).toISOString(),monthStart:new Date(localMidnight(p.year,p.month,1)).toISOString(),timezone:zone};
}
export function classifyDiscordTimestamp(createdAt,{now = new Date()} = {}) {
  const created=instant(createdAt), asOf=instant(now), at=created.getTime(), end=asOf.getTime();
  if (at>=end) return null;
  const p=parts(created), current=parts(asOf), recent=end-7*day;
  let tier,start,finish;
  if (at>=recent) {
    tier='daily'; start=Math.max(localMidnight(p.year,p.month,p.day),recent);
    finish=Math.min(localMidnight(p.year,p.month,p.day+1),end);
  } else if (p.year===current.year && p.month===current.month) {
    tier='weekly';
    const weekday=(new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay()+6)%7;
    start=Math.max(localMidnight(p.year,p.month,p.day-weekday),localMidnight(current.year,current.month,1));
    finish=Math.min(localMidnight(p.year,p.month,p.day-weekday+7),recent);
  } else {
    tier='monthly'; start=localMidnight(p.year,p.month,1);
    finish=Math.min(localMidnight(p.year,p.month+1,1),recent);
  }
  return {tier,periodStart:new Date(start).toISOString(),periodEnd:new Date(finish).toISOString(),timezone:zone};
}
