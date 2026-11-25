import test from 'node:test';
import assert from 'node:assert/strict';
import {collectCandidates,verifyArticle,parseFeed,NEWS_SOURCES} from '../server/news-sources.mjs';

const when='Wed, 25 Nov 2026 10:00:00 GMT';
const para='The Federal Reserve Board on Wednesday announced a long enough first paragraph of source text for the check to use as evidence.';

test('the headline can match any of the page titles, not only the first heading',()=>{
 const fed=NEWS_SOURCES.find(s=>s.id==='fed');
 const [candidate]=parseFeed(`<rss><channel><item><title>Federal Reserve announces new policy tool</title><link>https://www.federalreserve.gov/newsevents/pressreleases/other20261125a.htm</link><description>${para}</description><pubDate>${when}</pubDate></item></channel></rss>`,fed);
 const html=`<html><head><title>Federal Reserve Board - Press release</title><meta property="og:title" content="Federal Reserve announces new policy tool"><meta property="article:published_time" content="2026-11-25T10:00:00Z"></head><body><main><h1>Federal Reserve Board</h1><h1>Federal Reserve announces new policy tool</h1><p>${para}</p></main></body></html>`;
 assert.equal(verifyArticle(candidate,html).evidence.headlineMatched,true);
 const wrong=html.replace('<h1>Federal Reserve announces new policy tool</h1>','').replace('og:title" content="Federal Reserve announces new policy tool"','og:title" content="Something else entirely"');
 assert.equal(verifyArticle(candidate,wrong).evidence.headlineMatched,false);
});

test('a feed summary cut off with an ellipsis is checked against the article text',()=>{
 const source=NEWS_SOURCES.find(s=>s.id==='securityweek');
 const summary='Attackers exploited a flaw in a widely used firewall product to gain access to customer networks over several weeks';
 const [candidate]=parseFeed(`<rss><channel><item><title>Firewall flaw exploited in attacks</title><link>https://www.securityweek.com/firewall-flaw-exploited-in-attacks/</link><description>${summary} […]</description><pubDate>${when}</pubDate></item></channel></rss>`,source);
 const html=`<html><head><meta property="article:published_time" content="2026-11-25T10:00:00Z"></head><body><h1>Firewall flaw exploited in attacks</h1><div>${summary}, according to researchers who tracked the activity.</div></body></html>`;
 assert.equal(verifyArticle(candidate,html).evidence.summarySupported,true);
 assert.equal(verifyArticle(candidate,html.replace(summary,'Different words that do not match the feed at all, so this cannot be supported by the page')).evidence.summarySupported,false);
});

test('redirects are followed only to another allowlisted article of the same source',async()=>{
 const feed=`<rss><channel><item><title>Story about stocks and markets today</title><link>https://www.cnbc.com/2026/11/25/story-a.html</link><description>Summary of the story with plenty of words to be useful here for readers.</description><pubDate>${when}</pubDate></item></channel></rss>`;
 const make=location=>async url=>{
  if(!url.includes('cnbc.com'))return {ok:false,status:404,headers:{get:()=>null}};
  if(url.includes('view.xml'))return {ok:true,status:200,headers:{get:()=>null},text:async()=>feed};
  if(url.endsWith('story-a.html'))return {ok:false,status:301,headers:{get:name=>name==='location'?location:null}};
  return {ok:true,status:200,headers:{get:()=>null},text:async()=>'<html><body><h1>Story about stocks and markets today</h1></body></html>'};
 };
 const now=Date.parse('2026-11-25T12:00:00Z');
 const good=await collectCandidates({fetcher:make('https://www.cnbc.com/2026/11/25/story-b.html'),now});
 const mine=good.candidates.find(c=>c.sourceId==='cnbc-finance');
 assert.equal(mine.evidence.articleUrl,'https://www.cnbc.com/2026/11/25/story-a.html');
 assert.ok(!mine.evidence.verificationReasons.includes('article_fetch_source_url_not_allowed'));
 const bad=await collectCandidates({fetcher:make('https://evil.example/story'),now});
 const status=bad.sources.find(s=>s.id==='cnbc-finance');
 assert.equal(status.why.article_fetch_source_url_not_allowed,1);
});
