import {redisClient} from '../server/submissions.mjs';
import {runNewsIngest} from '../server/news-pipeline.mjs';
// Explicit one-time first check. Subsequent builds do not fetch sources or publish.
// Normal operation belongs to the authenticated twice-daily scheduled worker.
if(process.env.VERCEL_ENV==='production'&&process.env.NEWS_AUTO_PUBLISH_ENABLED==='true'&&/^[a-z0-9-]{1,80}$/.test(process.env.NEWS_INITIAL_RUN_ID||'')){
 const redis=redisClient();
 if(await redis(['SET','digivated:news:initial:'+process.env.NEWS_INITIAL_RUN_ID,'started','NX'])==='OK'){
  const report=await runNewsIngest({redis});
  console.info(JSON.stringify({event:'news_initial_check',status:report.status,published:report.published||0,skipped:report.skipped||0,duplicates:report.duplicates||0}));
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
