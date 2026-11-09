import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyStarterEntry,verifiedReviewedCapture,seedReviewedNews} from '../server/news-starter.mjs';
const entries=JSON.parse(readFileSync(new URL('../server/news-starter-20261109.json',import.meta.url),'utf8'));
const entry=entries[0],now=Math.max(...entries.map(e=>Date.parse(e.reviewedCapture.checkedAt)))+1000;
test('starter collection preserves 48-hour recency and expires provider reviews after 30 minutes',()=>{
 assert.equal(verifiedReviewedCapture(entry,now).evidence.verified,true);
 assert.throws(()=>verifiedReviewedCapture(entry,now+31*60000),/expired/);
 assert.throws(()=>verifiedReviewedCapture({...entry,sourcePublishedAt:new Date(now-49*3600000).toISOString()},now),/48-hour/);
 assert.throws(()=>verifiedReviewedCapture({...entry,sourceUrl:'https://untrusted.example/story'},now),/publisher/);
 assert.throws(()=>verifiedReviewedCapture({...entry,sourceHeadline:'Changed article'},now),/expired/);
 assert.throws(()=>verifiedReviewedCapture({...entry,reviewedCapture:{...entry.reviewedCapture,contentHash:'invalid'}},now));
});
test('live starter recheck rejects changed original time or unsupported source extract',()=>{
 const html=`<h1>${entry.sourceHeadline}</h1><p>${entry.sourceExcerpt}</p><script>{"datePublished":"${entry.sourcePublishedAt}"}</script>`;
 assert.equal(verifyStarterEntry(entry,html,now).evidence.verified,true);
 assert.throws(()=>verifyStarterEntry(entry,html.replace(entry.sourcePublishedAt,'2026-11-01T00:00:00Z'),now));
 assert.throws(()=>verifyStarterEntry(entry,html.replace(entry.sourceExcerpt,'An unrelated article.'),now));
});
test('starter data contains only reviewed, attributed, distinct recent stories',()=>{
 assert.equal(entries.length,10);assert.equal(new Set(entries.map(e=>e.sourceUrl)).size,10);
 for(const e of entries){assert.ok(now-Date.parse(e.sourcePublishedAt)<48*3600000);assert.ok(e.sourceExcerpt.length>=60);assert.ok(e.summary.length<900);assert.ok(e.reviewNote);assert.equal(verifiedReviewedCapture(e,now).evidence.originalPublicationTimeConfirmed,true);}
});
test('all expired starter entries are skipped without fetching or writing',async()=>{
 const report=await seedReviewedNews({now:now+49*3600000,dryRun:true,fetcher:()=>assert.fail('Expired story must not fetch')});
 assert.equal(report.skipped,10);assert.equal(report.checks.length,0);
});
