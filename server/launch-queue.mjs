import { timingSafeEqual } from 'node:crypto';
import { projectPublic, SAVE_EDIT, validId } from './admin-store.mjs';
import { redisClient } from './submissions.mjs';
import { readProjectSite, hasProjectBadge } from './project-site.mjs';
export const QUEUE='digivated:launch:free';
export function nextFreeLaunch(now=Date.now()){
 const d=new Date(now),day=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
 return new Date(day+((8-d.getUTCDay())%7||7)*86400000+7*86400000).toISOString();
}
export function badgeSnippet(id){return `<a href="https://digivated.com/projects/listing/${id}" data-digivated-project="${id}">[ listed on Digivated ]</a>`;}
export async function publishQueued(redis,record,now=Date.now()){
 if(record.status!=='pending'||record.launch?.kind!=='free'||!record.launch.badgeVerifiedAt||!Number.isFinite(Date.parse(record.launch.scheduledAt))||Date.parse(record.launch.scheduledAt)>now)return null;
 const updated={...record,status:'approved',publishedAt:new Date(now).toISOString(),revision:(record.revision||0)+1};
 const projection=projectPublic(updated);if(!projection)return null;
 const saved=await redis(['EVAL',SAVE_EDIT,4,`digivated:submission:${record.id}`,'digivated:submissions',`digivated:public:submission:${record.id}`,'digivated:public:submissions',record.revision||0,JSON.stringify(updated),JSON.stringify(projection),Date.parse(record.date),'submission']);
 if(saved!==1)return null;
 return projection;
}
export async function verifyProjectBadge(redis,account,id,readSite=readProjectSite){
 if(!validId(id))throw Error('Choose one of your saved projects.');
 const record=JSON.parse(await redis(['GET',`digivated:submission:${id}`]));
 if(record?.accountId!==account.id||record?.launch?.kind!=='free'||record.status!=='pending')throw Error('This project is not awaiting badge verification.');
 const {html}=await readSite(record.url);
 if(!hasProjectBadge(html,id))throw Error('Badge not found. Add the exact snippet to your project’s public page, publish it, then try again.');
 const updated={...record,revision:(record.revision||0)+1,launch:{...record.launch,badgeVerifiedAt:new Date().toISOString()}};
 const saved=await redis(['EVAL',SAVE_EDIT,4,`digivated:submission:${id}`,'digivated:submissions',`digivated:public:submission:${id}`,'digivated:public:submissions',record.revision||0,JSON.stringify(updated),'',Date.parse(record.date),'submission']);
 if(saved!==1)throw Error('The project changed. Refresh Your Projects and try again.');
 const project=await publishQueued(redis,updated);
 return {verified:true,scheduledAt:updated.launch.scheduledAt,...(project?{pageUrl:project.pageUrl}:{})};
}
export function makeLaunchQueueHandler(deps={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const send=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  const env=deps.env||process.env,expected=Buffer.from(`Bearer ${env.CRON_SECRET||''}`),actual=Buffer.from(req.headers.authorization||'');
  if(req.method!=='GET'||!env.CRON_SECRET||actual.length!==expected.length||!timingSafeEqual(actual,expected))return send(401,{error:'Unauthorized.'});
  try{
   const redis=deps.redis||redisClient(env),now=Date.now();
   const ids = await redis(['ZRANGEBYSCORE', QUEUE, '-inf', now, 'LIMIT', 0, 200]);
   let published = 0;
   let failed = 0;
   for (const id of ids) {
    try {
     const record = JSON.parse(await redis(['GET', `digivated:submission:${id}`]));
     if (!record || record.status !== 'pending' || record.launch?.kind !== 'free') {
      await redis(['ZREM', QUEUE, id]);
      continue;
     }
     if (await publishQueued(redis, record, now)) published++;
     else failed++;
    } catch {
     failed++;
    }
   }
   const result = {checked: ids.length, published, failed};
   console.info('Launch queue run', result);
   return send(failed ? 503 : 200, result);
  }catch{return send(503,{error:'Launch queue could not finish. Pending projects are preserved.'});}
 };
}
