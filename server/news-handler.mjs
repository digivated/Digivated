import {NEWS,CATEGORIES,newsStatus} from './news-store.mjs';
import {redisClient} from './submissions.mjs';
import {validNewsId} from '../src/lib/news-story.mjs';
import {stocksInTheNews,storyMentions,validStockSymbol} from '../src/lib/news-companies.mjs';
const parse=value=>{try{return value?JSON.parse(value):null;}catch{return null;}};
// One published story plus a few others to read next (same topic first).
export async function loadNewsStory(redis,id,now=Date.now()){
 if(!validNewsId(id))return null;
 const [raw,score,ids]=await Promise.all([redis(['GET',NEWS+'public:'+id]),redis(['ZSCORE',NEWS+'index:published',id]),redis(['ZREVRANGE',NEWS+'index:published',0,40])]);
 const record=parse(raw);
 if(!record||record.id!==id||score===null||score===undefined)return null;
 const others=(ids||[]).filter(other=>other!==id);
 const rows=others.length?(await redis(['MGET',...others.map(other=>NEWS+'public:'+other)])).map(parse).filter(item=>item&&validNewsId(item.id)):[];
 const related=[...rows.filter(item=>item.category===record.category),...rows.filter(item=>item.category!==record.category)].slice(0,4);
 return {story:publicNewsItem(record,now),related:related.map(item=>publicNewsItem(item,now))};
}
// News is free for everyone: every visitor gets the full archive, summaries and market snapshot.
export function publicNewsItem(record,now=Date.now()){
 return {id:record.id,sourceType:record.sourceType||'reporting',tickers:Array.isArray(record.tickers)?record.tickers:[],headline:record.headline,summary:record.summary,category:record.category,classification:record.classification==='breaking'&&now-Date.parse(record.sourcePublishedAt)<=6*3600000?'breaking':'update',sourceName:record.sourceName,sourceUrl:record.sourceUrl,sourcePublishedAt:record.sourcePublishedAt,publishedAt:record.publishedAt,verifiedAt:record.verifiedAt,summaryMethod:record.summaryMethod,correctedAt:record.updatedAt!==record.publishedAt?record.updatedAt:null};
}
export function makeNewsHandler(deps={}){
 return async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data));};
  if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'Use GET.'});}
  try{
   const env=deps.env||process.env,redis=deps.redis||redisClient(env),url=new URL(req.url,'https://digivated.com');
   if(url.searchParams.has('id')){const result=await loadNewsStory(redis,url.searchParams.get('id'),deps.now?.()||Date.now());return result?send(200,result):send(404,{error:'This story is not available.'});}
   const stock=(url.searchParams.get('stock')||'').trim().toUpperCase(),category=url.searchParams.get('category')||'all',q=(url.searchParams.get('q')||'').trim().slice(0,120).toLowerCase().replace(/^\$(?=[a-z0-9.-]+$)/,''),cursor=Number(url.searchParams.get('cursor')||0);
   if((stock&&!validStockSymbol(stock))||(category!=='all'&&!CATEGORIES.includes(category))||!Number.isInteger(cursor)||cursor<0||cursor>500)return send(400,{error:'Choose a valid category or page.'});
   const ids=await redis(['ZREVRANGE',NEWS+'index:published',0,499]);
   const raw=ids.length?await redis(['MGET',...ids.map(id=>NEWS+'public:'+id)]):[];
   const all=raw.filter(Boolean).flatMap(value=>{try{return[JSON.parse(value)];}catch{return[];}});
   const records=all.filter(record=>(category==='all'||record.category===category)&&(!stock||storyMentions(record,stock))&&`${record.headline} ${record.category} ${record.sourceName} ${(record.tickers||[]).map(t=>t.exchange+':'+t.symbol).join(' ')}${' '+record.summary}`.toLowerCase().includes(q));
   const now=deps.now?.()||Date.now();const visible=records.slice(cursor,cursor+20);
   const featured=records.filter(record=>now-Date.parse(record.sourcePublishedAt)<=24*3600000).sort((a,b)=>(b.importance||0)-(a.importance||0)||Date.parse(b.sourcePublishedAt)-Date.parse(a.sourcePublishedAt))[0];
   const [status,market]=await Promise.all([newsStatus(redis),redis(['GET',NEWS+'markets'])]);
   let markets={status:'unavailable',items:[],updatedAt:null};try{if(market)markets=JSON.parse(market);}catch{}
   if(markets.updatedAt&&now-Date.parse(markets.updatedAt)>48*3600000)markets={...markets,status:'stale'};
   // Stocks in the news looks at every recent story, so it holds steady while readers filter.
   let stocks=[];try{stocks=stocksInTheNews(all,{now});}catch{}
   return send(200,{items:visible.map(record=>publicNewsItem(record,now)),stocks,featured:featured?publicNewsItem(featured,now):null,next:cursor+20<records.length?String(cursor+20):null,markets,updatedAt:status.lastCheckedAt,pipeline:{lastCheckedAt:status.lastCheckedAt,status:status.paused?'paused':status.status}});
  }catch{return send(503,{error:'News is temporarily unavailable. Please try again shortly.'});}
 };
}
