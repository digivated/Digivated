import test from 'node:test';
import assert from 'node:assert/strict';
import {NEWS_SOURCES,parseFeed,verifyArticle,canonicalNewsUrl} from '../server/news-sources.mjs';
import {assessCandidate} from '../server/news-verification.mjs';
import {makeNewsHandler} from '../server/news-handler.mjs';
import {makeNewsIngestHandler} from '../server/news-ingest-handler.mjs';
import {runNewsIngest} from '../server/news-pipeline.mjs';
import {NEWS,insertNews,getNewsRecord,saveNewsRecord} from '../server/news-store.mjs';
import {testRedis} from './helpers/redis.mjs';
const now=Date.parse('2026-11-09T02:00:00Z');
const source=NEWS_SOURCES.find(s=>s.id==='microsoft-security');
const headline='Microsoft confirms active exploitation of Windows vulnerability';
const summary='Microsoft confirmed that attackers are actively exploiting a Windows vulnerability and released an emergency security update to protect affected organizations.';
const candidate={sourceId:source.id,sourceName:source.name,sourceUrl:'https://www.microsoft.com/en-us/security/blog/2026/11/09/windows/',category:'security',headline,feedSummary:summary,sourcePublishedAt:new Date(now-3600000).toISOString()};
const html=`<main><h1>${headline}</h1><p>${summary}</p></main><script type="application/ld+json">{"datePublished":"${candidate.sourcePublishedAt}"}</script>`;
const verified=()=>verifyArticle(candidate,html,new Date(now).toISOString());
async function call(handler,url='/api/news',extra={}){const headers={};let body;const res={setHeader:(k,v)=>headers[k]=v,end:v=>body=JSON.parse(v)};await handler({url,method:'GET',headers:{},...extra},res);return {code:res.statusCode,body,headers};}
test('source verification requires matching article, original timestamp and exact supported extract',()=>{
 const c=verified();assert.equal(c.evidence.verified,true);assert.equal(assessCandidate(c,{now}).decision,'publish');
 for(const modified of [html.replace(summary,'A different unsupported story.'),html.replace(headline,'Another unrelated story'),html.replace(candidate.sourcePublishedAt,'2026-11-08T01:00:00Z')])assert.equal(verifyArticle(candidate,modified).evidence.verified,false);
 assert.equal(canonicalNewsUrl('https://www.microsoft.com.evil.test/en-us/security/blog/x',source),'');
 assert.equal(canonicalNewsUrl('http://www.microsoft.com/en-us/security/blog/x',source),'');
});
test('Atom updated and date-only values never become original publication times',()=>{
 const openai=NEWS_SOURCES.find(s=>s.id==='openai');
 for(const time of ['<updated>2026-11-09T01:00:00Z</updated>','<published>2026-11-09</published>']){
 const [entry]=parseFeed(`<feed><entry><title>Introducing GPT-9</title><link href="https://openai.com/index/gpt-9/"/>${time}</entry></feed>`,openai);assert.equal(entry.sourcePublishedAt,null);}
 assert.throws(()=>parseFeed('<!DOCTYPE rss [<!ENTITY x "bad">]><rss/>',source));
});
test('rumors, negated claims, stale stories and uncertain importance cannot auto-publish',()=>{
 const c=verified();
 for(const text of ['Rumors of active exploitation of Windows','Windows is not actively exploited','A possible breach involving Windows'])assert.equal(assessCandidate({...c,headline:text},{now}).decision,'review');
 assert.equal(assessCandidate({...c,sourcePublishedAt:new Date(now-8*24*3600000).toISOString()},{now}).decision,'reject');
 assert.equal(assessCandidate({...c,sourcePublishedAt:new Date(now+1).toISOString()},{now}).decision,'review');
 assert.equal(assessCandidate({...c,headline:'A normal product update',sourceText:'An ordinary product improvement without a significant development worth breaking news coverage.'},{now}).decision,'review');
 assert.equal(assessCandidate({...c,headline:'How to protect Windows'},{now}).classification,'update');
 assert.equal(assessCandidate({...c,sourcePublishedAt:new Date(now-7*3600000).toISOString(),evidence:{...c.evidence,articlePublishedAt:null}},{now}).classification,'update');
});
test('public News is limited to five recent stories; members get the archive and markets',async()=>{
 const record={id:'a'.repeat(24),...verified(),tickers:[{symbol:'SMALL',exchange:'NASDAQ'}],summary:'PRIVATE MEMBER SUMMARY',publishedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),classification:'breaking',importance:95};
 const redis=async cmd=>cmd[0]==='ZREVRANGE'?[record.id]:cmd[0]==='MGET'?[JSON.stringify(record)]:null;
 const handler=member=>makeNewsHandler({redis,env:{},member:async()=>member,now:()=>now});
 const publicResult=await call(handler(false));assert.equal(publicResult.code,200);assert.equal(publicResult.body.member,false);assert.equal(publicResult.body.items[0].summary,record.summary);assert.equal(publicResult.body.next,null);assert.equal(publicResult.headers.Vary,'Cookie');assert.match(publicResult.headers['Cache-Control'],/no-store/);
 for(const secret of ['sourceText','contentHash','feedSummary'])assert.equal(JSON.stringify(publicResult.body).includes(secret),false);
 assert.equal((await call(handler(false),'/api/news?q=%24SMALL')).body.items.length,1);
 assert.equal((await call(handler(false),'/api/news?q=PRIVATE')).body.items.length,0);
 assert.equal((await call(handler(true))).body.items[0].summary,record.summary);
 assert.equal((await call(handler(true),'/api/news?q=PRIVATE')).body.items.length,1);
 assert.equal((await call(handler(false),'/api/news?category=invalid')).code,400);
});
test('public visitors cannot trigger source ingestion',async()=>{
 let called=false;const handler=makeNewsIngestHandler({env:{CRON_SECRET:'s'.repeat(40)},redis:async()=>null,run:async()=>{called=true;return {status:'ok'};}});
 assert.equal((await call(handler,'/api/news-ingest')).code,403);assert.equal(called,false);
 assert.equal((await call(handler,'/api/news-ingest',{headers:{authorization:'Bearer '+'s'.repeat(40)}})).code,200);assert.equal(called,true);
});
test('automatic ingestion skips uncertain stories without creating a review item',async()=>{
 const writes=[];
 const redis=async command=>{writes.push(command);if(command[0]==='GET')return null;if(command[0]==='SET')return 'OK';if(command[0]==='ZREVRANGE')return [];if(command[0]==='EVAL')return 1;return null;};
 const report=await runNewsIngest({env:{NEWS_AUTO_PUBLISH_ENABLED:'true'},redis,now:()=>now,collect:async()=>({candidates:[{...verified(),evidence:{...verified().evidence,verified:false}}],sources:[{status:'ok'}]}),markets:async()=>({items:[]})});
 assert.equal(report.skipped,1);
 assert.equal(report.published,0);
 assert.equal(writes.some(command=>command[0]==='ZADD'||command[0]==='EVAL'&&String(command).includes('index:review')),false);
});
test('owner can publish a fully source-verified review story without redundant confirmation or note', {skip:!process.env.DIGIVATED_TEST_REDIS_PORT}, async()=>{
 const redis=testRedis(9);await redis(['FLUSHDB']);
 const c=verified(),review={decision:'review',classification:'update',summary:summary,reasons:['importance_requires_editorial_judgment'],importance:0};
 const saved=await insertNews(redis,c,review,now),{record}=await getNewsRecord(redis,saved.id);
 assert.equal(record.status,'review');
 const published=await saveNewsRecord(redis,{id:record.id,revision:record.revision,headline:record.headline,summary:record.summary,category:record.category,classification:'update',status:'published',verificationConfirmed:false,reviewNote:''},now+1000);
 assert.equal(published.status,'published');assert.equal(published.ownerVerified,true);assert.equal(await redis(['GET',NEWS+'public:'+record.id])!==null,true);
 await redis(['FLUSHDB']);
});
test('real Redis: automatic publish, atomic dedup, review fallback, corrections and removal preserve audit', {skip:!process.env.DIGIVATED_TEST_REDIS_PORT}, async()=>{
 const redis=testRedis(9);await redis(['FLUSHDB']);
 const c=verified(),assessment=assessCandidate(c,{now});
 const inserts=await Promise.all([insertNews(redis,c,assessment,now),insertNews(redis,c,assessment,now)]);assert.equal(inserts.filter(r=>r.inserted).length,1);
 const id=inserts[0].id;const {record}=await getNewsRecord(redis,id);assert.equal(record.status,'published');
 const input={...record,verificationConfirmed:true,reviewNote:'Checked original source and corrected summary.',summary:record.summary+' Corrected.'};
 const changed=await saveNewsRecord(redis,input,now+1000);assert.equal(changed.revision,1);assert.deepEqual(changed.original,record.original);
 await assert.rejects(saveNewsRecord(redis,input,now+2000),e=>e.status===409);
 await saveNewsRecord(redis,{...changed,status:'removed',reviewNote:'Withdrawn after review.'},now+2000);assert.equal(await redis(['GET',NEWS+'public:'+id]),null);assert.equal((await getNewsRecord(redis,id)).audit.length,3);
 await redis(['FLUSHDB']);
 const run=()=>runNewsIngest({env:{NEWS_AUTO_PUBLISH_ENABLED:'true'},redis,now:()=>now,collect:async()=>({candidates:[c],sources:[{status:'ok'}]}),markets:async()=>({items:[]})});
 assert.equal((await run()).published,1);assert.equal((await run()).duplicates,1);
 await redis(['FLUSHDB']);
 const unverified={...c,evidence:{...c.evidence,verified:false}};
 const report=await runNewsIngest({env:{NEWS_AUTO_PUBLISH_ENABLED:'true'},redis,now:()=>now,collect:async()=>({candidates:[unverified],sources:[{status:'ok'}]}),markets:async()=>({items:[]}),assess:()=>assessment});
 assert.equal(report.published,0);assert.equal(report.skipped,1);assert.equal((await redis(['ZCARD',NEWS+'index:published'])),0);assert.equal((await redis(['ZCARD',NEWS+'index:review'])),0);
 await redis(['FLUSHDB']);
});
