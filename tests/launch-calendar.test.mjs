import test from 'node:test';
import assert from 'node:assert/strict';
import { inLaunchBatch, launchBounds, readRankingPeriod } from '../src/lib/launch-calendar.mjs';
const now=Date.parse('2026-11-13T12:00:00Z');
test('Monday UTC bounds include start and exclude following week',()=>{
 assert.deepEqual(launchBounds('current',now),{start:Date.parse('2026-11-09T00:00:00Z'),end:Date.parse('2026-11-16T14:00:00Z')});
 assert.equal(inLaunchBatch({date:'2026-11-09T00:00:00Z'},'current',now),true);
 assert.equal(inLaunchBatch({date:'2026-11-08T23:59:59.999Z'},'current',now),false);
 assert.equal(inLaunchBatch({date:'2026-11-09T00:00:00Z'},'previous',now),false);
 assert.equal(inLaunchBatch({date:'2026-11-02T00:00:00Z'},'previous',now),true);
});
test('the week holds until Monday 9 AM Eastern, then hands over',()=>{
 const monday=Date.parse('2026-11-16T00:00:00Z');
 // Sunday 7 PM Eastern (Monday 00:10 UTC) is still last Monday's week.
 const sunday=Date.parse('2026-11-23T00:10:00Z');
 assert.deepEqual(launchBounds('current',sunday),{start:monday,end:Date.parse('2026-11-23T14:00:00Z')});
 assert.equal(inLaunchBatch({date:'2026-11-16T05:00:00Z'},'current',sunday),true);
 assert.equal(inLaunchBatch({date:'2026-11-23T00:05:00Z'},'current',sunday),true);
 assert.equal(launchBounds('previous',sunday).end,monday);
 // 9 AM Eastern Monday: the new week begins and the old one becomes Last week.
 const handover=Date.parse('2026-11-23T14:00:00Z');
 assert.equal(launchBounds('current',handover-1).start,monday);
 assert.equal(launchBounds('current',handover).start,Date.parse('2026-11-23T00:00:00Z'));
 assert.equal(inLaunchBatch({date:'2026-11-16T05:00:00Z'},'previous',handover),true);
 assert.equal(inLaunchBatch({date:'2026-11-23T00:05:00Z'},'current',handover),true);
 // Daylight saving: 9 AM Eastern is 13:00 UTC after the March change.
 assert.equal(launchBounds('current',Date.parse('2027-03-15T12:59:00Z')).start,Date.parse('2027-03-08T00:00:00Z'));
 assert.equal(launchBounds('current',Date.parse('2027-03-15T13:00:00Z')).start,Date.parse('2027-03-15T00:00:00Z'));
});
test('publication wins over submission; future and invalid dates excluded',()=>{
 assert.equal(inLaunchBatch({date:'2026-11-01',publishedAt:'2026-11-10T00:00:00Z'},'current',now),true);
 for(const date of ['2026-11-16','2026-11-14','invalid'])assert.equal(inLaunchBatch({date},'current',now),false);
});
test('handles year boundary and timezone offsets',()=>{
 const boundary=Date.parse('2027-01-01T12:00:00Z');
 assert.equal(inLaunchBatch({date:'2026-12-28'},'current',boundary),true);
 assert.equal(inLaunchBatch({date:'2026-11-08T20:00:00-05:00'},'current',now),true);
});
test('valid vote period persists, invalid period uses launch default',()=>{
 assert.equal(readRankingPeriod('daily','previous'),'daily');
 assert.equal(readRankingPeriod(null,'previous'),'all');
 assert.equal(readRankingPeriod('bad','current'),'weekly');
});
