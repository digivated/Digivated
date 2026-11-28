import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NEWS_SOURCES, collectCandidates, verifyArticle } from '../server/news-sources.mjs';
import { assessCandidate } from '../server/news-verification.mjs';
import { assembleNews, indieSpotlight } from '../server/news-handler.mjs';
import { sameNewsEvent, nextNewsCheck } from '../src/lib/news-editorial.mjs';
import { renderNewsIndex } from '../server/news-feed-page.mjs';

const at='2026-11-25T08:00:00.000Z',now=Date.parse('2026-11-25T12:00:00Z');
const summary='Developers can now launch their applications using the new deployment workflow, with source-confirmed billing and platform changes for independent software teams.';
const candidate=(extra={})=>({sourceId:'vercel',sourceName:'Vercel',sourceType:'official-publisher',sourceUrl:'https://vercel.com/changelog/build-pricing',category:'indie-building',headline:'New deployment pricing for developers',sourcePublishedAt:at,sourceText:summary,evidence:{verified:true,headlineMatched:true,summarySupported:true,originalPublicationTimeConfirmed:true,timePrecision:'second'},...extra});

test('indie news publishes verified product changes but refuses unsupported or promotional claims',()=>{
 const result=assessCandidate(candidate(),{now});
 assert.equal(result.decision,'publish');assert.equal(result.category,'indie-building');assert.equal(result.classification,'update');
 for(const extra of [{evidence:{verified:false}},{headline:'Rumors of new deployment pricing'},{sourcePublishedAt:'2026-11-01T08:00:00Z'},{headline:'Webinar: meet our customers'},{headline:'How our customers build their teams'}])assert.notEqual(assessCandidate(candidate(extra),{now}).decision,'publish');
});

test('publisher-specific original dates require matching article evidence',()=>{
 const supabase=candidate({sourceId:'supabase',sourceUrl:'https://supabase.com/blog/new-tool',headline:'Introducing a new developer tool'});
 const page=`<h1>${supabase.headline}</h1><p>${summary}</p><script type="application/ld+json">{"datePublished":"2026-11-25"}</script>`;
 assert.equal(verifyArticle(supabase,page).evidence.verified,true);
 assert.equal(verifyArticle(supabase,page.replace('datePublished','dateModified')).evidence.verified,false);
 assert.equal(verifyArticle(supabase,page.replace('2026-11-25','2026-11-24')).evidence.verified,false);
 const stripe=candidate({sourceId:'stripe',sourceUrl:'https://stripe.com/blog/new-api',sourcePublishedAt:'2026-11-25T00:00:00.000Z'});
 const article=`<h1>${stripe.headline}</h1><p>${summary}</p><script>{"datePublished":"2026-11-25T00:00-08:00"}</script>`;
 assert.equal(verifyArticle(stripe,article).sourcePublishedAt,at);
 assert.equal(verifyArticle(stripe,article.replace('2026-11-25','2026-11-24')).evidence.verified,false);
});

test('coverage expansion bounds concurrent article requests across publishers',async()=>{
 let active=0,peak=0,articles=0;
 const selected=new Set(['vercel','supabase','stripe']);
 const fetcher=async url=>{
  const source=NEWS_SOURCES.find(s=>s.feedUrl===url);
  if(source){
   const entries=selected.has(source.id)?Array.from({length:10},(_,i)=>`<item><title>New developer workflow ${i}</title><link>https://${source.hosts[0]}/blog/item-${i}</link><pubDate>${at}</pubDate><description>${summary}</description></item>`).join(''):'';
   return {ok:true,status:200,headers:{get:()=>null},text:async()=>`<rss><channel>${entries}</channel></rss>`};
  }
  active++;articles++;peak=Math.max(peak,active);
  await new Promise(resolve=>setTimeout(resolve,2));active--;
  const i=new URL(url).pathname.split('-').at(-1);
  return {ok:true,status:200,headers:{get:()=>null},text:async()=>`<h1>New developer workflow ${i}</h1><p>${summary}</p><script>{"datePublished":"${at}"}</script>`};
 };
 const result=await collectCandidates({fetcher,now,maxPerSource:10});
 assert.equal(articles,30);assert.ok(peak<=12);assert.equal(result.candidates.length,30);assert.ok(result.candidates.every(c=>c.evidence.verified));
});

test('fresh same-source stories stay above older coverage and distinct releases are not merged',()=>{
 const records=Array.from({length:5},(_,i)=>({...candidate(),id:String(i).padStart(24,'0'),headline:`Unique developer product ${i}`,sourcePublishedAt:new Date(now-i*60000).toISOString(),publishedAt:at}));
 records.push({...records[0],id:'f'.repeat(24),sourceName:'Other publisher',sourcePublishedAt:'2026-11-24T08:00:00Z',headline:'Different older developer release'});
 const feed=assembleNews(records,{now});assert.deepEqual(feed.items.map(x=>x.id),records.map(x=>x.id));
 assert.equal(sameNewsEvent({...candidate(),headline:'Claude launches image editing tools'},{...candidate(),sourceUrl:'https://vercel.com/blog/different',headline:'Claude launches database migration tools'}),false);
});

test('indie section renders on the server without duplicating its stories in Latest',()=>{
 const item={...candidate(),id:'a'.repeat(24),publishedAt:at};
 const template='<nav class="news-toolbar" hidden></nav><div class="news-layout" hidden><section data-news-indie hidden><div data-news-indie-feed></div></section><div data-news-feed aria-busy="true"></div></div>';
 const html=renderNewsIndex(template,{items:[item],indie:[item]});
 assert.doesNotMatch(html,/class="news-layout" hidden/);assert.doesNotMatch(html,/data-news-indie hidden/);
 assert.equal((html.match(/class="news-story-link"/g)||[]).length,1);
});

test('quarter-hour scheduling matches the next-check timestamp',async()=>{
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.crons.find(x=>x.path==='/api/news-ingest').schedule,'*/15 * * * *');
 assert.equal(nextNewsCheck(Date.parse('2026-11-25T12:01:00Z')),'2026-11-25T12:15:00.000Z');
});

test('broader indie coverage includes founder business, creator publishing and distribution changes',()=>{
 const stories=[
  {sourceId:'ghost',sourceUrl:'https://ghost.org/changelog/editor-controls/',headline:'More visibility controls for editor cards',sourceText:'Publishers and creators can control which newsletter members see individual editor cards, supporting paid memberships and their independent publishing businesses.'},
  {sourceId:'tech-eu',sourceType:'independent-reporting',sourceUrl:'https://tech.eu/2026/11/25/bootstrap-milestone/',headline:'Bootstrapped startup reaches profitability with 10000 subscribers',sourceText:'The independent founder confirmed the software startup is profitable after growing subscription revenue and serving ten thousand paying customers without venture funding.'},
  {sourceId:'betakit',sourceType:'independent-reporting',sourceUrl:'https://betakit.com/founder-acquisition/',headline:'Founder sells newsletter software business',sourceText:'The founder sold the newsletter software business to another independent company. Existing customers will retain their subscription pricing under the signed acquisition agreement.'},
  {sourceId:'thenextweb',sourceType:'independent-reporting',sourceUrl:'https://thenextweb.com/news/marketplace-fees',headline:'Marketplace changes fees for independent creators',sourceText:'The marketplace updated the fees creators pay when selling their products. The new pricing applies to paid memberships and digital products sold through its distribution platform.'}
 ];
 for(const story of stories){const result=assessCandidate(candidate(story),{now});assert.equal(result.decision,'publish',story.headline);assert.equal(result.category,'indie-building');assert.equal(result.classification,'update');}
 for(const extra of [
  {headline:'Startup might be acquired after funding talks'},
  {headline:'Sponsored: a new creator tool'},
  {headline:'Weekly roundup of founder launches'},
  {headline:'How to build a newsletter business'},
  {headline:'Electric cars beat petrol sales',sourceText:'Electric vehicle sales exceeded petrol and diesel sales across European markets during the quarter, according to the latest registration data.'},
  {evidence:{verified:false,timePrecision:'second'}}
 ])assert.notEqual(assessCandidate(candidate(extra),{now}).decision,'publish');
});

test('new indie feeds keep article URLs on their approved publisher and article paths',()=>{
 for(const id of ['ghost','tech-eu','betakit','thenextweb']){
  const source=NEWS_SOURCES.find(s=>s.id===id);assert.ok(source&&!source.paused);
  assert.throws(()=>verifyArticle(candidate({sourceId:id,sourceUrl:'https://example.com/article'}),'<h1>New product</h1>'),/source_url_not_allowed/);
 }
 for(const [id,url] of [['ghost','https://ghost.org/pricing/'],['tech-eu','https://tech.eu/about/'],['thenextweb','https://thenextweb.com/conference/']])assert.throws(()=>verifyArticle(candidate({sourceId:id,sourceUrl:url}),''),/source_url_not_allowed/);
});


test('indie spotlight makes room for broader publishers without reordering Latest or losing sparse coverage',()=>{
 const records=Array.from({length:6},(_,i)=>({...candidate(),id:String(i).padStart(24,'0'),headline:`Distinct creator product ${i}`,sourcePublishedAt:new Date(now-i*60000).toISOString(),publishedAt:at}));
 records.push({...records[0],id:'e'.repeat(24),sourceName:'Ghost',headline:'New publishing controls for newsletters',sourcePublishedAt:new Date(now-3600000).toISOString()});
 records.push({...records[0],id:'f'.repeat(24),sourceName:'BetaKit',headline:'Bootstrapped founder sells independent software business',sourcePublishedAt:new Date(now-7200000).toISOString()});
 assert.deepEqual(indieSpotlight(records,{now}).map(x=>x.sourceName),['Vercel','Vercel','Ghost','BetaKit']);
 assert.deepEqual(assembleNews(records,{now}).items.map(x=>x.id),records.map(x=>x.id));
 assert.equal(indieSpotlight(records.slice(0,4),{now}).length,4);
 assert.ok(!indieSpotlight(records,{now,excludeId:records[0].id}).some(x=>x.id===records[0].id));
 assert.equal(indieSpotlight(records,{now:now+8*86400000}).length,0);
});

test('BetaKit full-text feed has a bounded allowance without raising article or other feed limits',async()=>{
 const fetcher=async url=>({ok:true,status:200,headers:{get:key=>key==='content-length'&&['https://betakit.com/feed/','https://ghost.org/changelog/rss/'].includes(url)?'1700000':null},text:async()=>'<rss><channel></channel></rss>'});
 const result=await collectCandidates({fetcher,now});
 assert.equal(result.sources.find(s=>s.id==='betakit').status,'ok');
 assert.equal(result.sources.find(s=>s.id==='ghost').error,'source_too_large');
 const oversized=await collectCandidates({fetcher:async url=>({...await fetcher(url),headers:{get:()=>url==='https://betakit.com/feed/'?'2000001':null}}),now});
 assert.equal(oversized.sources.find(s=>s.id==='betakit').error,'source_too_large');
});

test('SSR preserves dollar amounts and replacement tokens in headlines, summaries and boot JSON',()=>{
 const headline="Founder raises $1.1M, keeps $2 and $& literal";
 const item={...candidate(),id:'a'.repeat(24),headline,summary:"Pricing includes $1, $2, $& and $` without changing page markup.",publishedAt:at};
 const template='<nav class="news-toolbar" hidden></nav><div class="news-layout" hidden><section data-news-indie hidden><div data-news-indie-feed></div></section><div data-news-feed aria-busy="true"></div><button data-news-more>More</button></div><script id="news-boot" type="application/json"></script>';
 for(const indie of [[],[item]]){
  const boot={items:[item],indie};const html=renderNewsIndex(template,{items:[item],indie,boot});
  assert.equal((html.match(/data-news-feed\b/g)||[]).length,1);
  assert.equal((html.match(/data-news-indie-feed\b/g)||[]).length,1);
  assert.ok(html.includes('Founder raises $1.1M, keeps $2 and $&amp; literal'));
  assert.deepEqual(JSON.parse(html.match(/<script[^>]*id="news-boot"[^>]*>([\s\S]*?)<\/script>/)[1]),boot);
  assert.ok(html.includes('<button data-news-more>More</button>'));
 }
});

test('SSR fallback boot insertion preserves dollar replacement tokens too',()=>{
 const boot={items:[],q:'$& $` $1'};
 const html=renderNewsIndex('<head></head><body></body>',{boot});
 assert.deepEqual(JSON.parse(html.match(/<script[^>]*id="news-boot"[^>]*>([\s\S]*?)<\/script>/)[1]),boot);
});
