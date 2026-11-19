// TEMPORARY, preview-only, read-only. Lists free launches waiting on a badge and
// checks each site. Never merged; returns 404 outside preview deployments.
import { redisClient } from './submissions.mjs';
import { readProjectSite, hasProjectBadge, badgeProblem } from './project-site.mjs';
const oldMatch=(html,id)=>(html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|textarea|template)\b[^>]*>[\s\S]*?<\/\1>/gi,'').match(/<a\b[^>]*>/gi)||[]).some(t=>t.includes(`href="https://digivated.com/projects/listing/${id}"`)&&t.includes(`data-digivated-project="${id}"`));
export function makeBadgeAuditHandler(){
 return async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview'){res.statusCode=404;return res.end('{}');}
  const redis=redisClient(),ids=await redis(['ZRANGE','digivated:submissions',0,-1]);
  const waiting=[],counts={total:ids.length,pending:0,freePending:0,verifiedWaiting:0};
  for(const id of ids){let r;try{r=JSON.parse(await redis(['GET',`digivated:submission:${id}`]));}catch{continue;}
   if(r?.status!=='pending')continue;counts.pending++;
   if(r.launch?.kind!=='free')continue;counts.freePending++;
   if(r.launch.badgeVerifiedAt){counts.verifiedWaiting++;continue;}
   waiting.push(r);}
  const out=[];
  const one=async r=>{const row={name:r.name,url:r.url,saved:r.date?.slice(0,10),launch:r.launch.scheduledAt?.slice(0,10),consent:r.consent===true,account:Boolean(r.accountId)};
   try{const {html}=await readProjectSite(r.url);row.newCheck=hasProjectBadge(html,r.id);row.oldCheck=oldMatch(html,r.id);row.digivatedMentions=(html.match(/digivated/gi)||[]).length;if(!row.newCheck)row.reason=badgeProblem(html,r.id);}
   catch(e){row.error=String(e.message).slice(0,160);}
   out.push(row);};
  for(let i=0;i<waiting.length;i+=8)await Promise.all(waiting.slice(i,i+8).map(one));
  res.statusCode=200;res.end(JSON.stringify({counts,waiting:out.sort((a,b)=>(a.launch||'').localeCompare(b.launch||''))},null,1));
 };
}
