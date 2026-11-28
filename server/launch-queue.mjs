import { notifyLaunchScheduled, notifyProjectApproval } from './notifications.mjs';
import { timingSafeEqual } from 'node:crypto';
import { projectPublic, SAVE_EDIT, validId } from './admin-store.mjs';
import { redisClient } from './submissions.mjs';
import { readProjectSite, hasProjectBadge, badgeProblem } from './project-site.mjs';
import { finalizeLastWeek } from './launch-score.mjs';
import { sendProjectUpdate, sendBadgeEmail } from './account-mail.mjs';
import { freeLaunchTime, freeLaunchSchedule, novemberBatchTime, skippedNovemberBatch } from '../src/lib/launch-calendar.mjs';
export const QUEUE='digivated:launch:free';
export { nextFreeLaunch, freeLaunchOptions } from '../src/lib/launch-calendar.mjs';
export { badgeSnippet, badgeSnippets } from './badge-snippets.mjs';
export async function publishQueued(redis,record,now=Date.now(),{quiet=false}={}){
 const scheduled = freeLaunchSchedule(record);
 if(record.status!=='pending'||record.launch?.kind!=='free'||!record.launch.badgeVerifiedAt||!scheduled.scheduledAt||scheduled.scheduledTimestamp>now)return null;
 const updated={...record,launch:{...record.launch,...scheduled},status:'approved',publishedAt:new Date(now).toISOString(),revision:(record.revision||0)+1};
 const projection=projectPublic(updated);if(!projection)return null;
 const saved=await redis(['EVAL',SAVE_EDIT,4,`digivated:submission:${record.id}`,'digivated:submissions',`digivated:public:submission:${record.id}`,'digivated:public:submissions',record.revision||0,JSON.stringify(updated),JSON.stringify(projection),Date.parse(record.date),'submission']);
 if(saved!==1)return null;
 if(!quiet){
  try { await notifyProjectApproval(redis, record, updated); } catch { /* Publication already succeeded. */ }
  // Email the owner that their launch is live (same message as an admin approval).
  try { await sendProjectUpdate(record, updated); } catch { /* Publication already succeeded. */ }
 }
 return projection;
}
export async function verifyProjectBadge(redis,account,id,readSite=readProjectSite){
 if(!validId(id))throw Error('Choose one of your saved projects.');
 const record=JSON.parse(await redis(['GET',`digivated:submission:${id}`]));
 if(record?.accountId!==account.id||record?.launch?.kind!=='free')throw Error('This project is not awaiting badge verification.');
 const {badgeVerifiedAt}=record.launch;
 const {scheduledAt,scheduledTimestamp}=freeLaunchSchedule(record);
 if(badgeVerifiedAt&&['approved','featured'].includes(record.status)){
  return {verified:true,scheduledAt,pageUrl:projectPublic(record)?.pageUrl};
 }
 if(record.status!=='pending')throw Error('This project is not awaiting badge verification.');
 if(!scheduledAt)throw Error('This project has no valid launch date. Contact Digivated for help.');
 if(badgeVerifiedAt){
  const project=await publishQueued(redis,record);
  return {verified:true,scheduledAt,...(project?{pageUrl:project.pageUrl}:{})};
 }
 const {html}=await readSite(record.url);
 if(!hasProjectBadge(html,id))throw Error(badgeProblem(html,id));
 const {updated,project}=await saveVerified(redis,record);
 return {verified:true,scheduledAt:updated.launch.scheduledAt,...(project?{pageUrl:project.pageUrl}:{})};
}
async function saveVerified(redis,record,{quiet=false,now=Date.now()}={}){
 const id=record.id;
 const updated={...record,revision:(record.revision||0)+1,launch:{...record.launch,...freeLaunchSchedule(record),badgeVerifiedAt:new Date(now).toISOString()}};
 const saved=await redis(['EVAL',SAVE_EDIT,4,`digivated:submission:${id}`,'digivated:submissions',`digivated:public:submission:${id}`,'digivated:public:submissions',record.revision||0,JSON.stringify(updated),'',Date.parse(record.date),'submission']);
 if(saved!==1)throw Error('The project changed. Refresh Your Projects and try again.');
 const project=await publishQueued(redis,updated,now,{quiet});
 if(!project&&!quiet){try{await notifyLaunchScheduled(redis,updated);}catch{/* Verification already succeeded. */}}
 return {updated,project};
}

// Automatic: makers often add the badge and never come back to press "Check my
// website". Check every waiting free launch for them, and remind the ones whose
// badge is still missing (once a day after saving, once more before launch day).
const DAY=86_400_000;
const awaitingBadge=record=>record&&record.status==='pending'&&record.launch?.kind==='free'&&!record.launch.badgeVerifiedAt&&record.consent===true&&record.accountId&&Number.isFinite(Date.parse(record.launch.scheduledAt));
export function reminderStage(record,now){
 const launch=freeLaunchTime(record),saved=Date.parse(record.date);
 if(launch>now&&launch-now<=3*DAY)return 'last-call';
 if(Number.isFinite(saved)&&now-saved>=DAY&&launch>now)return 'nudge';
 return null;
}
// Repair submissions written before verified submissions were indexed atomically.
const repairVerifiedQueue = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local record = cjson.decode(raw)
local launch = record.launch
if record.status ~= 'pending' or type(launch) ~= 'table' or launch.kind ~= 'free'
 or type(launch.badgeVerifiedAt) ~= 'string' or type(launch.scheduledTimestamp) ~= 'number' then return 0 end
return redis.call('ZADD', KEYS[2], 'NX', launch.scheduledTimestamp, record.id)
`;
export async function checkPendingBadges(redis,{now=Date.now(),readSite=readProjectSite,mail=sendBadgeEmail,maxChecks=40,budgetMs=75_000,silent=false}={}){
 const ids=await redis(['ZRANGEBYSCORE','digivated:submissions',now-60*DAY,'+inf']);
 const result={waiting:0,verified:0,reminded:0,errors:0,queued:[],missing:[]};
 const seen=silent?new Set(await redis(['SMEMBERS','digivated:badge-scan:silent'])||[]):null;
 const waiting=[];
 for(const id of ids||[]){
  if(!validId(id))continue;
  let record;try{record=JSON.parse(await redis(['GET',`digivated:submission:${id}`]));}catch{continue;}
  if(record?.status==='pending'&&record.launch?.kind==='free'&&record.launch.badgeVerifiedAt&&Number.isFinite(record.launch.scheduledTimestamp)){
   await redis(['EVAL',repairVerifiedQueue,2,`digivated:submission:${id}`,QUEUE]);
   continue;
  }
  if(!awaitingBadge(record)||seen?.has(record.id))continue;
  waiting.push(record);
 }
 result.waiting=waiting.length;
 // Upcoming launches first (soonest first), then any whose date already passed.
 waiting.sort((a,b)=>{const x=freeLaunchTime(a),y=freeLaunchTime(b);return (x<now)-(y<now)||x-y;});
 // People who have not received the finish note go first, so a full queue
 // still reaches everyone instead of rechecking the same launches.
 const unsent=[],already=[];
 for(const record of waiting){
  if(await redis(['EXISTS',`digivated:badge-mail:${record.id}:finish`])===1)already.push(record);
  else unsent.push(record);
 }
 // Sites are checked eight at a time, within the route's time limit.
 const started=Date.now(),queue=[...unsent,...already].slice(0,maxChecks);
 const one=async record=>{
  try{
   let found=false;
   try{const {html}=await readSite(record.url);found=hasProjectBadge(html,record.id);}catch{/* Site unreachable today; remind below and retry tomorrow. */}
   if(found){
    const {updated,project}=await saveVerified(redis,record,{quiet:silent,now});
    result.verified++;
    if(silent){result.queued.push(updated.name||record.id);await redis(['SADD','digivated:badge-scan:silent',record.id]);await redis(['EXPIRE','digivated:badge-scan:silent',6*3600]);return;}
    if(project)return; // Publication already sent the live update.
    if(await redis(['SET',`digivated:badge-mail:${record.id}:verified`,'1','NX','EX',90*86400])==='OK'){
     const sent=await mail(updated,'verified');if(sent!=='sent')await redis(['DEL',`digivated:badge-mail:${record.id}:verified`]);
    }
    return;
   }
   if(silent){result.missing.push(record.name||record.id);await redis(['SADD','digivated:badge-scan:silent',record.id]);await redis(['EXPIRE','digivated:badge-scan:silent',6*3600]);return;}
   // One finish note per project. The day-after and last-call notes wait until
   // the next day, so an early run does not send two emails the same morning.
   const finishKey=`digivated:badge-mail:${record.id}:finish`;
   if(await redis(['SET',finishKey,String(now),'NX','EX',90*86400])==='OK'){
    const sent=await mail(record,'finish');
    if(sent==='sent')result.reminded++;
    else await redis(['DEL',finishKey]);
    return;
   }
   const finishAt=Number(await redis(['GET',finishKey]));
   if(finishAt>1e11&&now-finishAt<20*60*60*1000)return;
   const stage=reminderStage(record,now);
   if(!stage)return;
   // A last call also covers the first nudge, so nobody gets both in a row.
   const key=`digivated:badge-mail:${record.id}:${stage}`;
   if(await redis(['SET',key,'1','NX','EX',90*86400])!=='OK')return;
   if(stage==='nudge'&&await redis(['EXISTS',`digivated:badge-mail:${record.id}:last-call`])===1)return;
   const sent=await mail(record,stage);
   if(sent==='sent'){result.reminded++;if(stage==='last-call')await redis(['SET',`digivated:badge-mail:${record.id}:nudge`,'1','EX',90*86400]);}
   else await redis(['DEL',key]);
  }catch{result.errors++;}
 };
 for(let i=0;i<queue.length&&Date.now()-started<budgetMs;i+=8)await Promise.all(queue.slice(i,i+8).map(one));
 return result;
}
const bearerMatches=(authorization,secret)=>{
 if(!secret)return false;
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(authorization||'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
};
export function makeBadgeCheckHandler(deps={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const send=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  const env=deps.env||process.env;
  const silent=new URL(req.url||'/api/badge-check','https://digivated.invalid').searchParams.get('silent')==='1';
  const cronOk=bearerMatches(req.headers.authorization,env.CRON_SECRET);
  if(req.method!=='GET'||!cronOk)return send(401,{error:'Unauthorized.'});
  try{
   const result=await checkPendingBadges(deps.redis||redisClient(env),{now:(deps.now||Date.now)(),...(deps.readSite?{readSite:deps.readSite}:{}),...(deps.mail?{mail:deps.mail}:{}),...(silent?{silent:true,maxChecks:80,budgetMs:100_000,mail:async()=>'skipped'}:{})});
   console.info('Badge check run',{waiting:result.waiting,verified:result.verified,reminded:result.reminded,errors:result.errors,silent});
   return send(200,result);
  }catch{return send(503,{error:'Badge check could not finish. Nothing was changed.'});}
 };
}
export function makeLaunchQueueHandler(deps={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const send=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  const env=deps.env||process.env,expected=Buffer.from(`Bearer ${env.CRON_SECRET||''}`),actual=Buffer.from(req.headers.authorization||'');
  if(req.method!=='GET'||!env.CRON_SECRET||actual.length!==expected.length||!timingSafeEqual(actual,expected))return send(401,{error:'Unauthorized.'});
  try{
   const redis=deps.redis||redisClient(env),now=(deps.now||Date.now)();
   const due = await redis(['ZRANGEBYSCORE', QUEUE, '-inf', now, 'LIMIT', 0, 200]);
   // Until the old score becomes due, also pick up the rescheduled November batch.
   const moved = now >= novemberBatchTime && now < skippedNovemberBatch
     ? await redis(['ZRANGEBYSCORE', QUEUE, skippedNovemberBatch, skippedNovemberBatch])
     : [];
   const ids = [...new Set([...due, ...moved])];
   let published = 0;
   let failed = 0;
   for (const id of ids) {
    try {
     const record = JSON.parse(await redis(['GET', `digivated:submission:${id}`]));
     if (!record || record.status !== 'pending' || record.launch?.kind !== 'free') {
      await redis(['ZREM', QUEUE, id]);
      continue;
     }
     if (freeLaunchTime(record) > now) continue;
     if (await publishQueued(redis, record, now)) published++;
     else failed++;
    } catch {
     failed++;
    }
   }
   // Monday is also when last week's podium is frozen (also done lazily on first read).
   try { await finalizeLastWeek(redis, now); } catch { /* Retried on the next read. */ }
   const result = {checked: ids.length, published, failed};
   console.info('Launch queue run', result);
   return send(failed ? 503 : 200, result);
  }catch{return send(503,{error:'Launch queue could not finish. Pending projects are preserved.'});}
 };
}
