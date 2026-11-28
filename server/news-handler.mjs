import {NEWS,CATEGORIES,newsStatus} from './news-store.mjs';
import {redisClient} from './submissions.mjs';
import {safeSourceUrl,validNewsId} from '../src/lib/news-story.mjs';
import {stocksInTheNews,storyMentions,validStockSymbol} from '../src/lib/news-companies.mjs';
import {clusterNewsItems,headlineLocked,nextNewsCheck,pickFeatured,presentHeadline,presentSummary,suppressFromFeed} from '../src/lib/news-editorial.mjs';
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
 const locked=headlineLocked(record);
 const also=(Array.isArray(record.alsoCoveredBy)?record.alsoCoveredBy:[]).flatMap(item=>{const sourceUrl=safeSourceUrl(item?.sourceUrl);return sourceUrl&&sourceUrl!==record.sourceUrl?[{sourceName:String(item.sourceName||'').slice(0,80),sourceUrl,...(validNewsId(item.id)?{id:item.id}:{})}]:[];}).slice(0,4);
 return {id:record.id,sourceType:record.sourceType||'reporting',tickers:Array.isArray(record.tickers)?record.tickers:[],headline:locked?record.headline:presentHeadline(record),summary:locked?record.summary:presentSummary(record),category:record.category,classification:record.classification==='breaking'&&now-Date.parse(record.sourcePublishedAt)<=6*3600000?'breaking':'update',sourceName:record.sourceName,sourceUrl:record.sourceUrl,sourcePublishedAt:record.sourcePublishedAt,publishedAt:record.publishedAt,verifiedAt:record.verifiedAt,summaryMethod:record.summaryMethod,correctedAt:record.updatedAt!==record.publishedAt?record.updatedAt:null,...(!locked&&record.whyItMatters?{whyItMatters:record.whyItMatters}:{}),...(also.length?{alsoCoveredBy:also}:{})};
}
function withoutRank(item){if(!item)return null;const {importance,...rest}=item;return rest;}
export function assembleNews(records,{now=Date.now(),category='all',q='',stock='',cursor=0,limit=20}={}){
 const matched=records.filter(record=>(category==='all'||record.category===category)&&(!stock||storyMentions(record,stock))&&`${record.headline} ${record.category} ${record.sourceName} ${(record.tickers||[]).map(t=>t.exchange+':'+t.symbol).join(' ')} ${record.summary}`.toLowerCase().includes(q));
 const pool=(q||stock)?matched:matched.filter(record=>!suppressFromFeed(record));
 const sorted=pool.slice().sort((a,b)=>Date.parse(b.sourcePublishedAt||0)-Date.parse(a.sourcePublishedAt||0));
 const clustered=clusterNewsItems(sorted.map(record=>({...publicNewsItem(record,now),importance:record.importance||0,sourceType:record.sourceType||'reporting'})));
 // Latest stays chronological. Publisher diversity is enforced during
 // collection; it must not lift yesterday's stories above fresh reporting.
 const ordered=clustered;
 const featured=pickFeatured(ordered,now);
 return {items:ordered.slice(cursor,cursor+limit).map(withoutRank),featured:withoutRank(featured),next:cursor+limit<ordered.length?String(cursor+limit):null,ordered};
}
export function makeNewsHandler(deps={}){
 return async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data));};
  if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'Use GET.'});}
  try{
   const env=deps.env||process.env,redis=deps.redis||redisClient(env),url=new URL(req.url,'https://digivated.com');
   if(url.searchParams.has('id')){const result=await loadNewsStory(redis,url.searchParams.get('id'),deps.now?.()||Date.now());return result?send(200,result):send(404,{error:'This story is not available.'});}
   const brief=url.searchParams.get('view')==='brief',feedView=url.searchParams.get('view')==='feed';
   const stock=(url.searchParams.get('stock')||'').trim().toUpperCase(),category=url.searchParams.get('category')||'all',q=(url.searchParams.get('q')||'').trim().slice(0,120).toLowerCase().replace(/^\$(?=[a-z0-9.-]+$)/,''),cursor=Number(url.searchParams.get('cursor')||0);
   if((stock&&!validStockSymbol(stock))||(category!=='all'&&!CATEGORIES.includes(category))||!Number.isInteger(cursor)||cursor<0||cursor>500)return send(400,{error:'Choose a valid category or page.'});
   const ids=await redis(['ZREVRANGE',NEWS+'index:published',0,brief?40:499]);
   const raw=ids.length?await redis(['MGET',...ids.map(id=>NEWS+'public:'+id)]):[];
   const all=raw.filter(Boolean).flatMap(value=>{try{return[JSON.parse(value)];}catch{return[];}});
   const now=deps.now?.()||Date.now();
   const feed=assembleNews(all,{now,category:brief||feedView?'all':category,q:brief||feedView?'':q,stock:brief||feedView?'':stock,cursor:brief||feedView?0:cursor,limit:brief?12:feedView?100:20});
   if(feedView){
    res.setHeader('Cache-Control','public, max-age=300, s-maxage=600, stale-while-revalidate=900');
    return send(200,{items:feed.items});
   }
   if(brief){
    res.setHeader('Cache-Control','public, max-age=60, s-maxage=300, stale-while-revalidate=900');
    res.setHeader('Vercel-CDN-Cache-Control','public, s-maxage=300, stale-while-revalidate=900');
    res.setHeader('CDN-Cache-Control','public, s-maxage=300, stale-while-revalidate=900');
    return send(200,{items:feed.items.slice(0,3).map(item=>({id:item.id,headline:item.headline,sourceName:item.sourceName,sourcePublishedAt:item.sourcePublishedAt,category:item.category}))});
   }
   const [status,market]=await Promise.all([newsStatus(redis),redis(['GET',NEWS+'markets'])]);
   let markets={status:'unavailable',items:[],updatedAt:null};try{if(market)markets=JSON.parse(market);}catch{}
   if(markets.updatedAt&&now-Date.parse(markets.updatedAt)>48*3600000)markets={...markets,status:'stale'};
   // Stocks in the news looks at every recent story, so it holds steady while readers filter.
   let stocks=[];try{stocks=stocksInTheNews(all,{now});}catch{}
   const indie=assembleNews(all,{now,category:'indie-building',limit:5}).items.filter(item=>item.id!==feed.featured?.id&&now-Date.parse(item.sourcePublishedAt)<=7*86400000).slice(0,4);
   return send(200,{items:feed.items,indie,stocks,featured:feed.featured,next:feed.next,markets,updatedAt:status.lastCheckedAt,pipeline:{lastCheckedAt:status.lastCheckedAt,status:status.paused?'paused':status.status,nextCheckAt:nextNewsCheck(now)}});
  }catch{return send(503,{error:'News is temporarily unavailable. Please try again shortly.'});}
 };
}
