import {randomUUID} from 'node:crypto';
import {collectCandidates,isTrustedNewsUrl} from './news-sources.mjs';
import {assessCandidate,NEWS_MAX_AGE,BREAKING_MAX_AGE} from './news-verification.mjs';
import {fetchMarketSnapshot} from './news-markets.mjs';
import {NEWS,CATEGORIES,attachNewsCoverage,insertNews,saveNewsRecord} from './news-store.mjs';
import {sameNewsEvent,sourceSlotOpen} from '../src/lib/news-editorial.mjs';
const RELEASE="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
export async function runNewsIngest({env=process.env,redis,fetcher=fetch,now=Date.now,collect=collectCandidates,assess=assessCandidate,markets=fetchMarketSnapshot,backfill=false}={}){
 if(env.NEWS_AUTO_PUBLISH_ENABLED!=='true')return {status:'disabled',published:0};
 if(await redis(['GET',NEWS+'paused'])==='1')return {status:'paused',published:0};
 const lease=randomUUID(),started=now();
 if(await redis(['SET',NEWS+'lock',lease,'NX','EX',260])!=='OK')return {status:'busy',published:0};
 const report={id:lease,status:'running',startedAt:new Date(started).toISOString(),published:0,reviewed:0,skipped:0,rejected:0,duplicates:0,sources:[],errors:[],reasons:{}};
 try{
  const ids=await redis(['ZREVRANGE',NEWS+'index:all',0,149]);
  const existing=ids.length?(await redis(['MGET',...ids.map(id=>NEWS+'story:'+id)])).filter(Boolean).map(JSON.parse):[];
  // Reassess earlier review records when the policy changes. The original
  // source evidence must still pass and the source must still be within a week.
  for(const old of existing.filter(r=>r.status==='review')){
   if(now()-started>235000)break;
   const age=now()-Date.parse(old.sourcePublishedAt);
   if(!Number.isFinite(age)||age<0||age>NEWS_MAX_AGE||old.reasons?.some(r=>/duplicate/i.test(r)))continue;
   const candidate={...old,evidence:old.evidence,sourceText:old.sourceText,tickers:old.tickers};
   const assessment=assess(candidate,{now:now()});
   if(assessment.decision!=='publish'||!isTrustedNewsUrl(old.sourceUrl))continue;
   try{await saveNewsRecord(redis,{id:old.id,revision:old.revision,headline:old.headline,summary:assessment.summary,category:assessment.category,classification:assessment.classification,status:'published',reviewNote:'Published after renewed source and policy checks.',verificationConfirmed:false},now());report.published++;old.status='published';}
   catch{report.errors.push('A reviewed story could not be promoted; it remains private.');}
  }
  let cachedMarket=null;try{cachedMarket=JSON.parse(await redis(['GET',NEWS+'markets']));}catch{}
  const marketTask=cachedMarket&&started-Date.parse(cachedMarket.updatedAt)<3600000?Promise.resolve(cachedMarket):markets({fetcher,now:started});
  const [collection,snapshot]=await Promise.allSettled([collect({fetcher,now:started,knownUrls:existing.map(r=>r.sourceUrl),maxPerSource:backfill?15:5}),marketTask]);
  if(snapshot.status==='fulfilled'){
   if(snapshot.value.items?.length)await redis(['SET',NEWS+'markets',JSON.stringify(snapshot.value),'EX',172800]);
   else report.errors.push('Market observations are unavailable; prior dated snapshot retained.');
  }else report.errors.push('Market observations could not be checked.');
  if(collection.status!=='fulfilled')throw Error('Source collection failed.');
  report.sources=collection.value.sources||[];
  const candidates=(collection.value.candidates||[]).slice(0,backfill?150:75);
  const publishedBySource=new Map();
  for(const candidate of candidates){
   if(await redis(['GET',NEWS+'paused'])==='1'){report.status='paused';break;}
   if(now()-started>235000){report.errors.push('Run reached its time budget; remaining sources deferred.');break;}
   let result=assess(candidate,{now:now()});
   if(result.category)candidate.category=result.category;
   // Why candidates were not published, by category and first reason, for the run log.
   const why=reason=>{const key=`${candidate.category||'unknown'}:${reason}`;report.reasons[key]=(report.reasons[key]||0)+1;};
   if(result.decision==='reject'){why(result.reasons?.[0]||'rejected');report.rejected++;continue;}
   if(result.decision!=='publish'){why(result.reasons?.[0]||'review');report.skipped++;continue;}
   const time=Date.parse(candidate.sourcePublishedAt);
   const evidence=candidate.evidence||{};
   const hardVerified=isTrustedNewsUrl(candidate.sourceUrl)&&CATEGORIES.includes(candidate.category)&&evidence.verified===true&&evidence.originalPublicationTimeConfirmed===true&&evidence.headlineMatched===true&&evidence.summarySupported===true&&Number.isFinite(time)&&time<=now()&&now()-time<=NEWS_MAX_AGE;
   if(!hardVerified){why('not_hard_verified');report.skipped++;continue;}
   if(result.classification==='breaking'&&now()-time>BREAKING_MAX_AGE)result={...result,classification:'update'};
   const sameEvent=existing.find(record=>record.sourceUrl!==candidate.sourceUrl&&sameNewsEvent(record,candidate));
   if(sameEvent){
    if(sameEvent.status==='published'&&sameEvent.id){try{await attachNewsCoverage(redis,sameEvent.id,{sourceName:candidate.sourceName,sourceUrl:candidate.sourceUrl,sourcePublishedAt:candidate.sourcePublishedAt},now());}catch{/* The first story stays published. */}}
    report.duplicates++;continue;
   }
   if(!sourceSlotOpen(publishedBySource,candidate.sourceId,result.importance)){report.skipped++;continue;}
   const saved=await insertNews(redis,candidate,result,now());
   if(!saved.inserted){report.duplicates++;continue;}
   if(saved.status==='published'){report.published++;publishedBySource.set(candidate.sourceId,(publishedBySource.get(candidate.sourceId)||0)+1);}else report.skipped++;
   existing.push({...candidate,id:saved.id,status:saved.status});
  }
  if(report.status==='running')report.status=report.sources.length&&report.sources.every(s=>s.status==='failed')?'failed':report.sources.some(s=>s.status==='failed')||report.errors.length?'partial':'ok';
 }catch{report.status='failed';report.errors.push('News source verification could not complete. Existing stories were preserved.');}
 finally{
  report.finishedAt=new Date(now()).toISOString();
  await redis(['SET',NEWS+'latest',JSON.stringify(report)]);
  await redis(['LPUSH',NEWS+'runs',JSON.stringify(report)]);await redis(['LTRIM',NEWS+'runs',0,99]);
  await redis(['EVAL',RELEASE,1,NEWS+'lock',lease]);
 }
 return report;
}
