import {NEWS,CATEGORIES,newsStatus} from './news-store.mjs';
import {redisClient} from './submissions.mjs';
import {foundingConfig,readMember,FOUNDING_COOKIE} from './founding-access.mjs';
import {adminConfig,requireSession,tokenFrom} from './admin-auth.mjs';
export async function newsMember(req,redis,env,fetcher=fetch){
 if(tokenFrom(req)){try{await requireSession(req,redis,adminConfig(env));return true;}catch{}}
 if(!String(req.headers.cookie||'').includes(FOUNDING_COOKIE+'='))return false;
 try{return !!await readMember(req,foundingConfig(env),fetcher);}catch{return false;}
}
export function publicNewsItem(record,member,now=Date.now()){
 return {id:record.id,sourceType:record.sourceType||'reporting',tickers:Array.isArray(record.tickers)?record.tickers:[],headline:record.headline,summary:member?record.summary:'',locked:!member,category:record.category,classification:record.classification==='breaking'&&now-Date.parse(record.sourcePublishedAt)<=6*3600000?'breaking':'update',sourceName:record.sourceName,sourceUrl:record.sourceUrl,sourcePublishedAt:record.sourcePublishedAt,publishedAt:record.publishedAt,verifiedAt:record.verifiedAt,summaryMethod:record.summaryMethod,correctedAt:record.updatedAt!==record.publishedAt?record.updatedAt:null};
}
export function makeNewsHandler(deps={}){
 return async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('Vary','Cookie');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data));};
  if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'Use GET.'});}
  try{
   const env=deps.env||process.env,redis=deps.redis||redisClient(env),url=new URL(req.url,'https://digivated.com');
   const category=url.searchParams.get('category')||'all',q=(url.searchParams.get('q')||'').trim().slice(0,120).toLowerCase().replace(/^\$(?=[a-z0-9.-]+$)/,''),cursor=Number(url.searchParams.get('cursor')||0);
   if((category!=='all'&&!CATEGORIES.includes(category))||!Number.isInteger(cursor)||cursor<0||cursor>500)return send(400,{error:'Choose a valid category or page.'});
   const member=await(deps.member||newsMember)(req,redis,env,deps.fetcher||fetch);
   const ids=await redis(['ZREVRANGE',NEWS+'index:published',0,member?499:4]);
   const raw=ids.length?await redis(['MGET',...ids.map(id=>NEWS+'public:'+id)]):[];
   const records=raw.filter(Boolean).flatMap(value=>{try{return[JSON.parse(value)];}catch{return[];}}).filter(record=>(category==='all'||record.category===category)&&`${record.headline} ${record.category} ${record.sourceName} ${(record.tickers||[]).map(t=>t.exchange+':'+t.symbol).join(' ')}${member?' '+record.summary:''}`.toLowerCase().includes(q));
   const now=deps.now?.()||Date.now();const visible=records.slice(cursor,cursor+20);
   const featured=records.filter(record=>now-Date.parse(record.sourcePublishedAt)<=24*3600000).sort((a,b)=>(b.importance||0)-(a.importance||0)||Date.parse(b.sourcePublishedAt)-Date.parse(a.sourcePublishedAt))[0];
   const [status,market]=await Promise.all([newsStatus(redis),member?redis(['GET',NEWS+'markets']):Promise.resolve(null)]);
   let markets={status:'unavailable',items:[],updatedAt:null};try{if(market)markets=JSON.parse(market);}catch{}
   if(markets.updatedAt&&now-Date.parse(markets.updatedAt)>48*3600000)markets={...markets,status:'stale'};
   return send(200,{items:visible.map(record=>publicNewsItem(record,true,now)),featured:featured?publicNewsItem(featured,true,now):null,next:member&&cursor+20<records.length?String(cursor+20):null,member,markets,updatedAt:status.lastCheckedAt,pipeline:{lastCheckedAt:status.lastCheckedAt,status:status.paused?'paused':status.status}});
  }catch{return send(503,{error:'News is temporarily unavailable. Please try again shortly.'});}
 };
}
