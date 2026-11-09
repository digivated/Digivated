import {redisClient} from '../server/submissions.mjs';
import {runNewsIngest} from '../server/news-pipeline.mjs';
// Explicit one-time first check. Subsequent builds do not fetch sources or publish.
// Normal operation belongs to the authenticated five-minute scheduled worker.
if(process.env.VERCEL_ENV==='production'&&process.env.NEWS_AUTO_PUBLISH_ENABLED==='true'&&/^[a-z0-9-]{1,80}$/.test(process.env.NEWS_INITIAL_RUN_ID||'')){
 const redis=redisClient();
 if(await redis(['SET','digivated:news:initial:'+process.env.NEWS_INITIAL_RUN_ID,'started','NX'])==='OK'){
  const report=await runNewsIngest({redis});
  console.info(JSON.stringify({event:'news_initial_check',status:report.status,published:report.published||0,reviewed:report.reviewed||0,duplicates:report.duplicates||0}));
 }
}
