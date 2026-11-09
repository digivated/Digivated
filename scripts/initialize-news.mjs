import {redisClient} from '../server/submissions.mjs';
import {runNewsIngest} from '../server/news-pipeline.mjs';
import {getNewsRecord,saveNewsRecord} from '../server/news-store.mjs';
// Explicit one-time first check. Subsequent builds do not fetch sources or publish.
// Normal operation belongs to the authenticated twice-daily scheduled worker.
if(process.env.VERCEL_ENV==='production'&&process.env.NEWS_AUTO_PUBLISH_ENABLED==='true'&&/^[a-z0-9-]{1,80}$/.test(process.env.NEWS_INITIAL_RUN_ID||'')){
 const redis=redisClient();
 if(await redis(['SET','digivated:news:initial:'+process.env.NEWS_INITIAL_RUN_ID,'started','NX'])==='OK'){
  const report=await runNewsIngest({redis});
  console.info(JSON.stringify({event:'news_initial_check',status:report.status,published:report.published||0,skipped:report.skipped||0,duplicates:report.duplicates||0}));
 }
}

// Withdraw a small set of clearly off-topic starter stories by immutable ID.
// Exact headline checks keep this one-time editorial correction bounded.
if(process.env.VERCEL_ENV==='production'){
 const redis=redisClient(),key='digivated:news:scope-cleanup:20261109-v1';
 const entries=[
  ['e120b878a12761b045e28a52','job on the line'],
  ['f0be6325bfc4dec9fdd9097f','memo to Nvidia'],
  ['d08dc641958eb32375163f81','Soul Glo'],
  ['7978cc85b6b0372d326c6667','Apps to distract'],
  ['6924233f3e83d09de08a7513','SNL has'],
  ['2f1c02ddf8130da3cb52aea7','cybersecurity VC'],
  ['3af53f8572641d8a87f7ed86','Cybertruck experiment'],
 ];
 if(await redis(['SET',key,'running','NX','EX',900])==='OK'){
  try{
   let removed=0;
   for(const [id,expected] of entries){
    let record;try{({record}=await getNewsRecord(redis,id));}catch{continue;}
    if(record.status!=='published'||!record.headline.includes(expected))continue;
    await saveNewsRecord(redis,{id,revision:record.revision,headline:record.headline,summary:record.summary,category:record.category,classification:'update',status:'removed',reviewNote:'Outside the News section’s AI/Tech, Markets, and Security editorial scope.'});
    removed++;
   }
   await redis(['SET',key,'complete']);
   console.info(JSON.stringify({event:'news_scope_cleanup',removed}));
  }catch{
   await redis(['DEL',key]);
   console.warn('News scope cleanup did not complete; existing stories were preserved.');
  }
 }
}

// One-time catch-up for the larger seven-day starter feed. Redis keeps this
// idempotent across builds; source failures never fail the site deployment.
if(process.env.VERCEL_ENV==='production'&&process.env.NEWS_AUTO_PUBLISH_ENABLED==='true'){
 const redis=redisClient(),key='digivated:news:backfill:20261109-weekly-40-v1';
 if(await redis(['SET',key,'running','NX','EX',1800])==='OK'){
  try{
   let count=Number(await redis(['ZCARD','digivated:news:index:published']))||0;
   for(let attempt=0;attempt<3&&count<40;attempt++){
    const report=await runNewsIngest({redis,backfill:true});
    count=Number(await redis(['ZCARD','digivated:news:index:published']))||0;
    console.info(JSON.stringify({event:'news_weekly_backfill',attempt:attempt+1,status:report.status,published:report.published,skipped:report.skipped,totalPublished:count}));
    if(report.status==='disabled'||report.status==='paused'||report.status==='busy'||report.status==='failed')break;
   }
   if(count>=40)await redis(['SET',key,'complete']);else await redis(['DEL',key]);
  }catch{
   await redis(['DEL',key]);
   console.warn('News backfill could not complete; existing published stories were preserved.');
  }
 }
}

// A separately reviewed starter collection, not a relaxed automatic publishing policy.
if(process.env.VERCEL_ENV==='production'&&process.env.NEWS_STARTER_RUN_ID==='reviewed-20261109-v1'){
 const redis=redisClient();
 if(await redis(['SET','digivated:news:starter-run:reviewed-20261109-v1','started','NX'])==='OK'){
  const {seedReviewedNews}=await import('../server/news-starter.mjs');
  const report=await seedReviewedNews({redis});
  console.info(JSON.stringify({event:'news_starter_check',published:report.published,reviewed:report.reviewed,duplicates:report.duplicates,skipped:report.skipped}));
 }
}
