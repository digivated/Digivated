import {timingSafeEqual} from 'node:crypto';
import {redisClient} from './submissions.mjs';
import {AdminError,adminConfig,requireSession,jsonBody} from './admin-auth.mjs';
import {runNewsIngest} from './news-pipeline.mjs';
const authorized=(value,secret)=>{if(typeof secret!=='string'||secret.length<32||typeof value!=='string')return false;const a=Buffer.from(value),b=Buffer.from('Bearer '+secret);return a.length===b.length&&timingSafeEqual(a,b);};
export function makeNewsIngestHandler(deps={}){
 return async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');
  const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data));};
  try{
   const env=deps.env||process.env,redis=deps.redis||redisClient(env);
   if(!(req.method==='GET'&&authorized(req.headers.authorization,env.CRON_SECRET))){
    if(req.method!=='POST')throw new AdminError(403,'Use the News desk.');
    const cfg=adminConfig(env);
    if(req.method!=='POST'||req.headers.origin!==cfg.origin||req.headers['sec-fetch-site']==='cross-site')throw new AdminError(403,'Use the News desk.');
    const session=await requireSession(req,redis,cfg);if(req.headers['x-admin-csrf']!==session.csrf)throw new AdminError(403,'Refresh the News desk.');
    const body=await jsonBody(req,1024);if(body.action!=='run')throw new AdminError(400,'Choose Run source check.');
   }
   const report=await(deps.run||runNewsIngest)({env,redis,fetcher:deps.fetcher||fetch});
   console.info(JSON.stringify({event:'news_ingest',status:report.status,published:report.published||0,skipped:report.skipped||0,rejected:report.rejected||0,duplicates:report.duplicates||0}));
   return send(report.status==='failed'?502:200,report);
  }catch(error){return send(error instanceof AdminError?error.status:503,{error:error instanceof AdminError?error.message:'News source checks are temporarily unavailable.'});}
 };
}
