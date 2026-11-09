import {randomUUID} from 'node:crypto';
import {collectCandidates,isTrustedNewsUrl} from './news-sources.mjs';
import {assessCandidate,NEWS_MAX_AGE,BREAKING_MAX_AGE} from './news-verification.mjs';
import {fetchMarketSnapshot} from './news-markets.mjs';
import {NEWS,CATEGORIES,insertNews} from './news-store.mjs';
const RELEASE="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
function tokens(text){return new Set(String(text).toLowerCase().replace(/[^a-z0-9 -]/g,' ').split(/\s+/).filter(t=>t.length>3&&!['with','from','that','this','after','their','security','announces'].includes(t)));}
function related(a,b){const x=tokens(a),y=tokens(b);if(x.size<5||y.size<5)return false;const shared=[...x].filter(t=>y.has(t)).length;return shared/Math.max(x.size,y.size)>=.78;}
export async function runNewsIngest({env=process.env,redis,fetcher=fetch,now=Date.now,collect=collectCandidates,assess=assessCandidate,markets=fetchMarketSnapshot}={}){
 if(env.NEWS_AUTO_PUBLISH_ENABLED!=='true')return {status:'disabled',published:0};
 if(await redis(['GET',NEWS+'paused'])==='1')return {status:'paused',published:0};
 const lease=randomUUID(),started=now();
 if(await redis(['SET',NEWS+'lock',lease,'NX','EX',260])!=='OK')return {status:'busy',published:0};
 const report={id:lease,status:'running',startedAt:new Date(started).toISOString(),published:0,reviewed:0,rejected:0,duplicates:0,sources:[],errors:[]};
 try{
  const ids=await redis(['ZREVRANGE',NEWS+'index:all',0,149]);
  const existing=ids.length?(await redis(['MGET',...ids.map(id=>NEWS+'story:'+id)])).filter(Boolean).map(JSON.parse):[];
  let cachedMarket=null;try{cachedMarket=JSON.parse(await redis(['GET',NEWS+'markets']));}catch{}
  const marketTask=cachedMarket&&started-Date.parse(cachedMarket.updatedAt)<3600000?Promise.resolve(cachedMarket):markets({fetcher,now:started});
  const [collection,snapshot]=await Promise.allSettled([collect({fetcher,now:started,knownUrls:existing.map(r=>r.sourceUrl)}),marketTask]);
  if(snapshot.status==='fulfilled'){
   if(snapshot.value.items?.length)await redis(['SET',NEWS+'markets',JSON.stringify(snapshot.value),'EX',172800]);
   else report.errors.push('Market observations are unavailable; prior dated snapshot retained.');
  }else report.errors.push('Market observations could not be checked.');
  if(collection.status!=='fulfilled')throw Error('Source collection failed.');
  report.sources=collection.value.sources||[];
  const candidates=(collection.value.candidates||[]).slice(0,40);
  for(const candidate of candidates){
   if(await redis(['GET',NEWS+'paused'])==='1'){report.status='paused';break;}
   if(now()-started>235000){report.errors.push('Run reached its time budget; remaining sources deferred.');break;}
   let result=assess(candidate,{now:now()});
   if(result.category)candidate.category=result.category;
   if(result.decision==='reject'){report.rejected++;continue;}
   const time=Date.parse(candidate.sourcePublishedAt);
   const evidence=candidate.evidence||{};
   const hardVerified=isTrustedNewsUrl(candidate.sourceUrl)&&CATEGORIES.includes(candidate.category)&&evidence.verified===true&&evidence.originalPublicationTimeConfirmed===true&&evidence.headlineMatched===true&&evidence.summarySupported===true&&Number.isFinite(time)&&time<=now()&&now()-time<=NEWS_MAX_AGE;
   if(result.decision==='publish'&&!hardVerified)result={...result,decision:'review',classification:'update',reasons:[...(result.reasons||[]),'Independent publication checks did not all pass.']};
   if(result.classification==='breaking'&&now()-time>BREAKING_MAX_AGE)result={...result,classification:'update'};
   const sameEvent=existing.find(record=>record.category===candidate.category&&Math.abs(Date.parse(record.sourcePublishedAt)-time)<48*3600000&&related(record.headline,candidate.headline)&&record.sourceUrl!==candidate.sourceUrl);
   if(sameEvent)result={...result,decision:'review',reasons:[...(result.reasons||[]),'Potential duplicate of '+sameEvent.id+'; compare sources before publishing.']};
   const saved=await insertNews(redis,candidate,result,now());
   if(!saved.inserted){report.duplicates++;continue;}
   if(saved.status==='published')report.published++;else report.reviewed++;
   existing.push({...candidate,id:saved.id});
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
