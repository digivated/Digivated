import test from 'node:test';
import assert from 'node:assert/strict';
import {collectCandidates} from '../server/news-sources.mjs';

const now=Date.parse('2026-11-25T12:00:00Z');
const feed=`<?xml version="1.0"?><rss version="2.0"><channel>${Array.from({length:20},(_,i)=>`<item><title>Story number ${i} about stocks and markets today</title><link>https://www.cnbc.com/2026/11/25/story-${i}.html</link><description>Summary ${i} of the story with plenty of words to be useful here for readers.</description><pubDate>Wed, 25 Nov 2026 11:${String(59-i).padStart(2,'0')}:00 GMT</pubDate></item>`).join('')}</channel></rss>`;
const fetcher=async url=>url.includes('cnbc.com')?{ok:true,headers:{get:()=>null},text:async()=>url.includes('view.xml')?feed:'<html><body><h1>x</h1></body></html>'}:{ok:false,status:404,headers:{get:()=>null}};

test('later runs skip stories already checked and reach deeper into a feed',async()=>{
 const checked=new Set();
 const seen=async urls=>new Set(urls.filter(url=>checked.has(url)));
 const run=async()=>{
  const result=await collectCandidates({fetcher,now,maxPerSource:8,seen});
  const mine=result.candidates.filter(c=>c.sourceId==='cnbc-finance');
  mine.forEach(c=>checked.add(c.sourceUrl));
  return {mine,status:result.sources.find(s=>s.id==='cnbc-finance')};
 };
 const first=await run(),second=await run(),third=await run();
 assert.equal(first.mine.length,8);assert.equal(first.status.alreadyChecked,0);
 assert.equal(second.mine.length,8);assert.equal(second.status.alreadyChecked,8);
 assert.equal(third.mine.length,4);
 assert.equal(new Set([...first.mine,...second.mine,...third.mine].map(c=>c.sourceUrl)).size,20);
 assert.ok(first.status.why.article_headline_not_supported>0);
});

test('a failing seen lookup never stops collection',async()=>{
 const result=await collectCandidates({fetcher,now,maxPerSource:3,seen:async()=>{throw new Error('redis down');}});
 assert.equal(result.candidates.filter(c=>c.sourceId==='cnbc-finance').length,3);
});
