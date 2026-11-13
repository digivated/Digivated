import test from 'node:test';
import assert from 'node:assert/strict';
import { inLaunchBatch, launchBounds, readRankingPeriod } from '../src/lib/launch-calendar.mjs';
const now=Date.parse('2026-11-13T12:00:00Z');
test('Monday UTC bounds include start and exclude following week',()=>{
 assert.deepEqual(launchBounds('current',now),{start:Date.parse('2026-11-09T00:00:00Z'),end:Date.parse('2026-11-16T00:00:00Z')});
 assert.equal(inLaunchBatch({date:'2026-11-09T00:00:00Z'},'current',now),true);
 assert.equal(inLaunchBatch({date:'2026-11-08T23:59:59.999Z'},'current',now),false);
 assert.equal(inLaunchBatch({date:'2026-11-09T00:00:00Z'},'previous',now),false);
 assert.equal(inLaunchBatch({date:'2026-11-02T00:00:00Z'},'previous',now),true);
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
