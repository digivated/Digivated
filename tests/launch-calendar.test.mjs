import test from 'node:test';
import assert from 'node:assert/strict';
import { inLaunchBatch, launchBounds, readRankingPeriod } from '../src/lib/launch-calendar.mjs';
const now=Date.parse('2026-11-13T12:00:00Z');
test('weeks run Monday 9 AM Eastern to the next Monday 9 AM Eastern',()=>{
 assert.deepEqual(launchBounds('current',now),{start:Date.parse('2026-11-09T14:00:00Z'),end:Date.parse('2026-11-16T14:00:00Z')});
 assert.equal(inLaunchBatch({date:'2026-11-09T14:00:00Z'},'current',now),true);
 assert.equal(inLaunchBatch({date:'2026-11-09T13:59:59.999Z'},'current',now),false);
 assert.equal(inLaunchBatch({date:'2026-11-09T14:00:00Z'},'previous',now),false);
 assert.equal(inLaunchBatch({date:'2026-11-02T15:00:00Z'},'previous',now),true);
 // Sunday evening still belongs to the week that is ending; Monday before 9 AM too.
 assert.deepEqual(launchBounds('current',Date.parse('2026-11-23T00:30:00Z')),{start:Date.parse('2026-11-16T14:00:00Z'),end:Date.parse('2026-11-23T14:00:00Z')});
 assert.deepEqual(launchBounds('current',Date.parse('2026-11-23T14:00:00Z')),{start:Date.parse('2026-11-23T14:00:00Z'),end:Date.parse('2026-11-30T14:00:00Z')});
});
test('publication wins over submission; future and invalid dates excluded',()=>{
 assert.equal(inLaunchBatch({date:'2026-11-01',publishedAt:'2026-11-10T00:00:00Z'},'current',now),true);
 for(const date of ['2026-11-16','2026-11-14','invalid'])assert.equal(inLaunchBatch({date},'current',now),false);
});
test('handles year boundary and timezone offsets',()=>{
 const boundary=Date.parse('2027-01-01T12:00:00Z');
 assert.equal(inLaunchBatch({date:'2026-12-28T14:00:00Z'},'current',boundary),true);
 assert.equal(inLaunchBatch({date:'2026-11-09T20:00:00-05:00'},'current',now),true);
});
test('valid vote period persists, invalid period uses launch default',()=>{
 assert.equal(readRankingPeriod('daily','previous'),'daily');
 assert.equal(readRankingPeriod(null,'previous'),'all');
 assert.equal(readRankingPeriod('bad','current'),'weekly');
});
