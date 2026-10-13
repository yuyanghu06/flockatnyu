import test from 'node:test';
import assert from 'node:assert/strict';
import {getDiscordSummarySchedule,getDiscordCalendarWeekStart} from '../server/discord/summary-schedule.js';

test('Monday08 New York protects the current calendar week beginningMonday00 through both DST transitions',()=>{
  for(const [now,date,cutoff] of [
    ['2026-03-02T13:00:00Z','2026-03-02','2026-03-02T05:00:00.000Z'],
    ['2026-03-09T12:00:00Z','2026-03-09','2026-03-09T04:00:00.000Z'],
    ['2026-10-26T12:00:00Z','2026-10-26','2026-10-26T04:00:00.000Z'],
    ['2026-11-02T13:00:00Z','2026-11-02','2026-11-02T05:00:00.000Z'],
  ]){
    const result=getDiscordSummarySchedule({now});
    assert.equal(result.status,'due');assert.equal(result.mode,'weekly');assert.equal(result.timezone,'America/New_York');
    assert.equal(result.localDate,date);assert.equal(result.dueIdentity,'weekly:'+date);
    assert.equal(result.weeklyRawCutoff,cutoff);assert.equal(result.currentWeekStart,cutoff);assert.equal(Date.parse(result.asOf)-Date.parse(cutoff),8*3600000);
  }
});

test('the alternate UTC slot and ordinary days cannot generate daily summaries',()=>{
  for(const now of [
    '2026-03-09T13:00:00Z','2026-11-02T12:00:00Z',
    '2026-03-09T11:59:59.999Z','2026-03-09T13:00:00Z',
    '2026-03-10T12:00:00Z','2026-10-11T12:00:00Z',
  ]){
    const result=getDiscordSummarySchedule({now});assert.equal(result.status,'not_due');assert(!result.dueIdentity);assert.notEqual(result.mode,'daily');
  }
});

test('monthly08 gate identifies only the previous calendar month including year rollover',()=>{
  for(const [now,previous] of [
    ['2026-01-01T13:00:00Z','2025-12'],
    ['2026-03-01T13:00:00Z','2026-02'],
    ['2026-04-01T12:00:00Z','2026-03'],
  ]){
    const result=getDiscordSummarySchedule({now});assert.equal(result.status,'due');assert.equal(result.mode,'monthly');
    assert.equal(result.monthlyPeriod,previous);assert.equal(result.dueIdentity,'monthly:'+previous);
  }
});

test('Monday the first chooses monthly closure before weekly work',()=>{
  const result=getDiscordSummarySchedule({now:'2026-06-01T12:00:00Z'});
  assert.equal(result.status,'due');assert.equal(result.mode,'monthly');assert.equal(result.dueIdentity,'monthly:2026-05');
});

test('manual bootstrap/weekly/monthly are explicit operators and bypass clock gates with stable identities',()=>{
  const now='2026-10-11T23:45:00Z';
  assert.equal(getDiscordSummarySchedule({now}).status,'not_due');
  for(const [mode,identity] of [['bootstrap','bootstrap:2026-10-11T23:45:00.000Z'],['weekly','weekly:2026-10-11'],['monthly','monthly:2026-09']]){
    const result=getDiscordSummarySchedule({now,mode});assert.equal(result.status,'due');assert.equal(result.mode,mode);assert.equal(result.dueIdentity,identity);
  }
  assert.equal(getDiscordSummarySchedule({now:()=>Date.parse(now),mode:'monthly'}).dueIdentity,'monthly:2026-09');
});

test('delayed startup freezes the08 snapshot/cutoff and invalid daily/date requests fail closed',()=>{
  assert.equal(getDiscordSummarySchedule({now:'2026-03-09T12:00:00Z'}).dueIdentity,getDiscordSummarySchedule({now:'2026-03-09T12:00:55Z'}).dueIdentity);
  const delayed=getDiscordSummarySchedule({now:'2026-03-09T12:37:42Z'});
  assert.equal(delayed.status,'due');assert.equal(delayed.asOf,'2026-03-09T12:00:00.000Z');assert.equal(delayed.weeklyRawCutoff,'2026-03-09T04:00:00.000Z');
  assert.equal(getDiscordSummarySchedule({now:'invalid'}).status,'invalid_request');
  assert.equal(getDiscordSummarySchedule({now:'2026-03-09T12:00:00Z',mode:'daily'}).status,'invalid_request');
});

test('Sunday tails, cross-month weeks and167/169-hour DST calendar weeks do not use elapsed rolling retention',()=>{
  for(const [now,start] of [
    ['2026-03-08T13:00:00Z','2026-03-02T05:00:00.000Z'],
    ['2026-11-01T13:00:00Z','2026-10-26T04:00:00.000Z'],
    ['2026-10-01T12:00:00Z','2026-09-28T04:00:00.000Z'],
    ['2026-01-01T13:00:00Z','2025-12-29T05:00:00.000Z'],
    ['2026-03-09T03:59:59.999Z','2026-03-02T05:00:00.000Z'],
  ])assert.equal(getDiscordCalendarWeekStart({now}),start);
  assert.equal(Date.parse(getDiscordCalendarWeekStart({now:'2026-03-09T12:00:00Z'}))-Date.parse(getDiscordCalendarWeekStart({now:'2026-03-02T13:00:00Z'})),167*3600000);
  assert.equal(Date.parse(getDiscordCalendarWeekStart({now:'2026-11-02T13:00:00Z'}))-Date.parse(getDiscordCalendarWeekStart({now:'2026-10-26T12:00:00Z'})),169*3600000);
  assert.equal(getDiscordCalendarWeekStart({now:'2026-02-30T12:00:00Z'}),null);
});
