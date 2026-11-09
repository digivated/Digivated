import {createHash} from 'node:crypto';

// Approved official, reporting and issuer feeds. Candidate URLs cannot expand this allowlist.
export const NEWS_SOURCES=Object.freeze([
 {id:'fed',name:'Federal Reserve',feedUrl:'https://www.federalreserve.gov/feeds/press_all.xml',hosts:['www.federalreserve.gov'],category:'markets'},
 {id:'sec',name:'U.S. Securities and Exchange Commission',feedUrl:'https://www.sec.gov/news/pressreleases.rss',hosts:['www.sec.gov'],category:'markets'},
 {id:'google',name:'Google',feedUrl:'https://blog.google/rss/',hosts:['blog.google'],category:'ai-tech'},
 {id:'openai',name:'OpenAI',feedUrl:'https://openai.com/news/rss.xml',hosts:['openai.com'],category:'ai-tech'},
 {id:'microsoft-security',name:'Microsoft Security',feedUrl:'https://www.microsoft.com/en-us/security/blog/feed/',hosts:['www.microsoft.com'],category:'security'},
 {id:'github',name:'GitHub',feedUrl:'https://github.blog/changelog/feed/',hosts:['github.blog'],category:'ai-tech'},
 {id:'techcrunch',name:'TechCrunch',feedUrl:'https://techcrunch.com/feed/',hosts:['techcrunch.com'],category:'ai-tech',sourceType:'independent-reporting'},
 {id:'bleepingcomputer',name:'BleepingComputer',feedUrl:'https://www.bleepingcomputer.com/feed/',hosts:['www.bleepingcomputer.com'],category:'security',sourceType:'independent-reporting'},
 {id:'prnewswire-earnings',name:'PR Newswire',feedUrl:'https://www.prnewswire.com/rss/financial-services-latest-news/earnings-list.rss',hosts:['www.prnewswire.com'],category:'markets',sourceType:'issuer-release'},
 {id:'globenewswire',name:'GlobeNewswire',feedUrl:'https://www.globenewswire.com/RssFeed/subjectcode/27-Company%20Announcement/feedTitle/GlobeNewswire%20-%20Company%20Announcement',hosts:['www.globenewswire.com'],category:'markets',sourceType:'issuer-release'},
]);
export function extractNewsTickers(text){
 const found=new Map();for(const match of String(text).matchAll(/\b(NASDAQ|NYSE(?:AMERICAN|ARCA)?|TSX(?:V)?|ASX|LSE|OTCQX|OTCQB|OTC)\s*:\s*([A-Z][A-Z0-9.-]{0,11})\b/gi)){
  if(match[2]!==match[2].toUpperCase())continue;
  const symbol=match[2].toUpperCase(),exchange=match[1].toUpperCase();found.set(exchange+':'+symbol,{symbol,exchange});
 }return [...found.values()].slice(0,8);
}
const LIMIT=1600000;
const TIMEOUT=9000;
const USER_AGENT='DigivatedNews/1.0 (+https://digivated.com/news; attributed-source-check)';
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',ndash:'–',mdash:'—',hellip:'…'};
export function decodeEntities(value=''){
 return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(full,key)=>{
  if(key[0]!=='#')return entities[key.toLowerCase()]??full;
  const n=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
  return Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';
 });
}
export function plainText(value=''){
 return decodeEntities(decodeEntities(value).replace(/<(script|style|noscript|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
}
export function canonicalNewsUrl(value,source){
 try{
  const u=new URL(decodeEntities(value));
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!source.hosts.includes(u.hostname))return '';
  if(source.id==='microsoft-security'&&!u.pathname.startsWith('/en-us/security/blog/'))return '';
  if(source.id==='fed'&&!u.pathname.startsWith('/newsevents/pressreleases/'))return '';
  if(source.id==='sec'&&!u.pathname.startsWith('/newsroom/press-releases/'))return '';
  if(source.id==='github'&&!u.pathname.startsWith('/changelog/'))return '';
  if(source.id==='bleepingcomputer'&&!u.pathname.startsWith('/news/'))return '';
  if(source.id==='prnewswire-earnings'&&!u.pathname.startsWith('/news-releases/'))return '';
  if(source.id==='globenewswire'&&!u.pathname.startsWith('/news-release/'))return '';
  if(source.id==='openai'&&!u.pathname.startsWith('/index/'))return '';
  u.hash='';for(const name of [...u.searchParams.keys()])if(/^(utm_|fbclid$|gclid$)/i.test(name))u.searchParams.delete(name);
  return u.href;
 }catch{return '';}
}
async function getText(url,source,fetcher,limit=LIMIT){
 const allowed=url===source.feedUrl||canonicalNewsUrl(url,source);
 if(!allowed)throw new Error('source_url_not_allowed');
 const response=await fetcher(url,{redirect:'error',cache:'no-store',headers:{'User-Agent':USER_AGENT,Accept:'application/rss+xml,application/atom+xml,text/xml,text/html;q=0.9'},signal:AbortSignal.timeout(TIMEOUT)});
 if(!response.ok)throw new Error(`source_http_${response.status}`);
 if(Number(response.headers?.get?.('content-length')||0)>limit)throw new Error('source_too_large');
 const body=response.body;
 if(body?.getReader){
  const reader=body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('source_too_large');chunks.push(value);}}
  finally{try{await reader.cancel();}catch{}}
  return Buffer.concat(chunks).toString('utf8');
 }
 const text=await response.text();if(Buffer.byteLength(text)>limit)throw new Error('source_too_large');return text;
}
function tag(block,name){return block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}\\s*>`,'i'))?.[1]||'';}
function validTimestamp(raw){
 const value=decodeEntities(raw).trim();
 // Feed retrieval time and Atom updated time never substitute for original publication.
 if(!value||/^\d{4}-\d{2}-\d{2}$/.test(value)||!/(?:GMT|UTC|[+-]\d{2}:?\d{2}|Z)\s*$/i.test(value))return null;
 const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;
}
export function parseFeed(xml,source){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g,'')))throw new Error('xml_entities_not_allowed');
 const entries=[...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].slice(0,50);
 if(!entries.length&&!/<(?:rss|feed)\b/i.test(xml))throw new Error('invalid_feed');
 return entries.flatMap(([,type,block])=>{
  const headline=plainText(tag(block,'title')).slice(0,300);
  const rawUrl=type.toLowerCase()==='item'?plainText(tag(block,'link')):block.match(/<link\b(?=[^>]*\brel=["']alternate["'])[^>]*\bhref=["']([^"']+)["']/i)?.[1]||block.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i)?.[1];
  const sourceUrl=canonicalNewsUrl(rawUrl,source);if(!headline||!sourceUrl)return [];
  const rawTime=tag(block,type.toLowerCase()==='item'?'pubDate':'published');
  const description=plainText(tag(block,'description')||tag(block,'summary')).replace(/The post .* appeared first on .*$/i,'').trim().slice(0,1800);
  return [{sourceId:source.id,sourceName:source.name,sourceUrl,sourcePublishedAt:validTimestamp(rawTime),originalTimeValue:plainText(rawTime),headline,feedSummary:description,category:source.category,sourceType:source.sourceType||'official-publisher'}];
 });
}
const words=s=>plainText(s).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[];
function supported(snippet,text){
 const wanted=[...new Set(words(snippet))],available=new Set(words(text));
 return wanted.length>=6&&wanted.filter(word=>available.has(word)).length/wanted.length>=.84;
}
function metadata(html){
 const metas=[];for(const [,attributes] of html.matchAll(/<meta\b([^>]+)>/gi)){
  const values={};for(const [,key,value]of attributes.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))values[key.toLowerCase()]=decodeEntities(value);
  metas.push(values);
 }
 return metas;
}
export function verifyArticle(candidate,html,checkedAt=new Date().toISOString()){
 const source=NEWS_SOURCES.find(s=>s.id===candidate.sourceId);if(!source||!canonicalNewsUrl(candidate.sourceUrl,source))throw new Error('source_url_not_allowed');
 const metas=metadata(html),title=plainText(tag(html,'h1')||metas.find(m=>m.property==='og:title')?.content||tag(html,'title'));
 const scope=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html;
 const text=plainText(scope).slice(0,70000);
 const dates=[...html.matchAll(/["']datePublished["']\s*:\s*["']([^"']+)["']/gi)].map(m=>validTimestamp(m[1]));
 dates.push(...metas.filter(m=>['article:published_time','date','dc.date','dcterms.created','datepublished'].includes((m.property||m.name||'').toLowerCase())).map(m=>validTimestamp(m.content)));
 const original=[...new Set(dates.filter(Boolean))];
 const norm=s=>plainText(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const exactTitle=!!norm(title)&&norm(title).includes(norm(candidate.headline));
 const finalHeadlineMatched=exactTitle;
 const firstParagraph=[...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>plainText(m[1])).find(p=>p.length>=100&&!/cookie|newsletter|subscribe|copyright|register|advertisement|sponsored|image credits/i.test(p))||'';
 const sourceText=candidate.feedSummary?.length>=60&&norm(text).includes(norm(candidate.feedSummary))?candidate.feedSummary:firstParagraph;
 const summarySupported=!!sourceText&&norm(text).includes(norm(sourceText));
 const feedTime=candidate.sourcePublishedAt;
 let matchingDate=original.find(date=>feedTime&&Math.abs(Date.parse(date)-Date.parse(feedTime))<=60000);
 let articlePublishedDate=null,timeSource='article_metadata';
 if(!matchingDate&&!original.length&&feedTime&&['fed','sec'].includes(source.id)){
  const rawDate=source.id==='fed'?html.match(/<p\b[^>]*class=["'][^"']*article__time[^"']*["'][^>]*>([^<]+)</i)?.[1]:html.match(/Washington[^<]{0,100}?,\s*([A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4})/i)?.[1];
  const parsed=rawDate?Date.parse(plainText(rawDate)+' 12:00:00 GMT'):NaN;
  if(Number.isFinite(parsed)){articlePublishedDate=new Date(parsed).toISOString().slice(0,10);if(articlePublishedDate===feedTime.slice(0,10)){matchingDate=feedTime;timeSource='official_feed_with_article_date';}}
 }
 const reasons=[];
 if(!finalHeadlineMatched)reasons.push('article_headline_not_supported');
 if(!summarySupported)reasons.push('feed_summary_not_supported_by_article');
 if(!feedTime)reasons.push('original_publication_time_missing');
 if(!matchingDate)reasons.push(original.length?'article_and_feed_times_disagree':'article_publication_time_not_confirmed');
 const verified=finalHeadlineMatched&&summarySupported&&!!matchingDate;
 return {...candidate,tickers:extractNewsTickers(candidate.headline+' '+sourceText+' '+firstParagraph),sourceText,articleText:text,sourcePublishedAt:matchingDate||feedTime,evidence:{verified,checkedAt,feedUrl:source.feedUrl,feedPublishedAt:feedTime,articleUrl:candidate.sourceUrl,articlePublishedAt:timeSource==='article_metadata'?(matchingDate||original[0]||null):null,articlePublishedDate,timeSource,originalPublicationTimeConfirmed:!!matchingDate,headlineMatched:finalHeadlineMatched,summarySupported,timePrecision:feedTime?'second':'unknown',contentHash:createHash('sha256').update(text).digest('hex'),verificationReasons:reasons}};
}
export async function collectCandidates({fetcher=fetch,now=Date.now(),knownUrls=[]}={}){
 const known=new Set(knownUrls);
 const checkedAt=new Date(now).toISOString(),candidates=[],sources=[];
 await Promise.all(NEWS_SOURCES.map(async source=>{
  const status={id:source.id,name:source.name,status:'ok',checkedAt,feedUrl:source.feedUrl,found:0,verified:0,review:0};
  try{
   const entries=parseFeed(await getText(source.feedUrl,source,fetcher),source);status.found=entries.length;
   // Fetch at most three current items per publisher, concurrently; stale feed items
   // are reported in source counts but never disguised as a new publication.
   const current=entries.filter(c=>!known.has(c.sourceUrl)&&(!c.sourcePublishedAt||(Date.parse(c.sourcePublishedAt)>=now-48*3600000&&Date.parse(c.sourcePublishedAt)<=now+300000))).slice(0,3);
   await Promise.all(current.map(async c=>{
    try{const result=verifyArticle(c,await getText(c.sourceUrl,source,fetcher),checkedAt);candidates.push(result);result.evidence.verified?status.verified++:status.review++;}
    catch(error){status.review++;candidates.push({...c,sourceText:c.feedSummary,evidence:{verified:false,checkedAt,feedUrl:source.feedUrl,timePrecision:c.sourcePublishedAt?'second':'unknown',verificationReasons:['article_could_not_be_verified']}});}
   }));
  }catch(error){status.status='failed';status.error=/^(source_http_\d{3}|source_too_large|source_url_not_allowed|xml_entities_not_allowed|invalid_feed)$/.test(error.message||'')?error.message:'source_fetch_failed';}
  sources.push(status);
 }));
 return {candidates:candidates.sort((a,b)=>String(b.sourcePublishedAt||'').localeCompare(String(a.sourcePublishedAt||''))),sources:sources.sort((a,b)=>a.id.localeCompare(b.id)),checkedAt};
}

export const isTrustedNewsUrl=url=>NEWS_SOURCES.some(source=>!!canonicalNewsUrl(url,source));
