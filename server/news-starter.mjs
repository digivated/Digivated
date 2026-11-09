import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {plainText} from './news-sources.mjs';
import {insertNews,NEWS} from './news-store.mjs';
const publishers={'www.reuters.com':'Reuters','techcrunch.com':'TechCrunch'};
const normalize=s=>plainText(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function validateEntry(entry,now){
 const url=new URL(entry.sourceUrl),time=Date.parse(entry.sourcePublishedAt);
 if(url.protocol!=='https:'||url.username||url.password||url.port||publishers[url.hostname]!==entry.sourceName)throw Error('Starter publisher is not approved.');
 if(!Number.isFinite(time)||time>now||now-time>48*3600000)throw Error('Starter article is outside the 48-hour window.');
 if(!['ai-tech','markets','security'].includes(entry.category)||!entry.reviewNote||entry.summary.length<60||entry.summary.length>900)throw Error('Starter editorial review is incomplete.');
 return {url,time};
}
export function verifyStarterEntry(entry,html,now=Date.now()){
 const {url,time}=validateEntry(entry,now);
 const dates=[...html.matchAll(/["']datePublished["']\s*:\s*["']([^"']+)/gi)].map(m=>Date.parse(m[1]));
 const text=normalize(html);
 if(!dates.some(t=>t===time)||!text.includes(normalize(entry.sourceHeadline))||!entry.sourceExcerpt||!text.includes(normalize(entry.sourceExcerpt)))throw Error('Original article evidence does not match the reviewed entry.');
 return {...entry,sourceId:'editorial-'+url.hostname,sourceText:entry.sourceExcerpt,evidence:{verified:true,checkedAt:new Date(now).toISOString(),originalPublicationTimeConfirmed:true,timePrecision:'second',articlePublishedAt:entry.sourcePublishedAt,headlineMatched:true,summarySupported:true,sourceHeadline:entry.sourceHeadline,summaryReview:entry.reviewNote,researchReference:entry.researchReference,verificationMethod:'editorial_review_with_live_original_recheck',contentHash:createHash('sha256').update(html).digest('hex')}};
}
export function verifiedReviewedCapture(entry,now=Date.now()){
 validateEntry(entry,now);
 const c=entry.reviewedCapture;
 if(c?.provider!=='Firecrawl'||!c.scrapeId||!c.originalPublicationTimeConfirmed||c.sourceUrl!==entry.sourceUrl||c.sourceHeadline!==entry.sourceHeadline||c.sourcePublishedAt!==entry.sourcePublishedAt||!/^[a-f0-9]{64}$/.test(c.contentHash)||!Number.isFinite(Date.parse(c.checkedAt))||Date.parse(c.checkedAt)>now||now-Date.parse(c.checkedAt)>30*60000)throw Error('Reviewed source capture is missing or expired.');
 return {...entry,sourceId:'editorial-'+new URL(entry.sourceUrl).hostname,sourceText:entry.sourceExcerpt,evidence:{verified:true,checkedAt:c.checkedAt,originalPublicationTimeConfirmed:true,timePrecision:'second',articlePublishedAt:entry.sourcePublishedAt,headlineMatched:true,summarySupported:true,sourceHeadline:entry.sourceHeadline,summaryReview:entry.reviewNote,researchReference:c.scrapeId,verificationMethod:'editorial_review_of_live_provider_capture',contentHash:c.contentHash}};
}
async function liveArticle(url,fetcher){
 const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'DigivatedNews/1.0 (+https://digivated.com/news)'}});
 if(!response.ok||Number(response.headers.get('content-length')||0)>2500000)throw Error('Original article unavailable.');
 const reader=response.body.getReader(),chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2500000)throw Error('Original article exceeds limit.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks).toString('utf8');
}
export async function seedReviewedNews({redis,fetcher=fetch,now=Date.now(),dryRun=false}={}){
 const entries=JSON.parse(await readFile(new URL('./news-starter-20261109.json',import.meta.url),'utf8'));
 const report={published:0,duplicates:0,reviewed:0,skipped:0,checks:[]};
 for(const entry of entries){
  // Recheck age on every attempt. A deployment can never revive expired starter news.
  if(now-Date.parse(entry.sourcePublishedAt)>48*3600000||Date.parse(entry.sourcePublishedAt)>now){report.skipped++;continue;}
  let candidate,decision='publish';
  try{candidate=verifyStarterEntry(entry,await liveArticle(entry.sourceUrl,fetcher),now);}
  catch{try{candidate=verifiedReviewedCapture(entry,now);}catch{decision='review';candidate={...entry,sourceId:'editorial-review',sourceText:entry.sourceExcerpt,evidence:{verified:false,checkedAt:new Date(now).toISOString(),verificationReasons:['Live original source recheck failed. Open the original article before publishing.'],researchReference:entry.researchReference,sourceHeadline:entry.sourceHeadline}};}}
  report.checks.push({headline:entry.headline,decision});
  if(dryRun)continue;
  const saved=await insertNews(redis,candidate,{decision,classification:'update',summary:entry.summary,importance:entry.importance,eventKey:'starter:'+entry.sourceUrl,reasons:[entry.reviewNote],editorialReview:true,summaryMethod:'editorial-summary'},now);
  if(!saved.inserted)report.duplicates++;else if(decision==='publish')report.published++;else report.reviewed++;
 }
 if(!dryRun)await redis(['SET',NEWS+'starter:20261109',JSON.stringify({...report,at:new Date(now).toISOString()})]);
 return report;
}
