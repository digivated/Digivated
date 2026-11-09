import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCandidate} from '../server/news-verification.mjs';
import {extractNewsTickers,NEWS_SOURCES,parseFeed,verifyArticle,collectCandidates} from '../server/news-sources.mjs';
const now=Date.parse('2026-11-09T02:00:00Z'),at=new Date(now-3600000).toISOString();
const evidence={verified:true,timePrecision:'second',originalPublicationTimeConfirmed:true,headlineMatched:true,summarySupported:true,articlePublishedAt:at};
function candidate(sourceId,headline,sourceText){const s=NEWS_SOURCES.find(s=>s.id===sourceId);const path=sourceId==='github'?'/changelog/new-api':sourceId==='globenewswire'?'/news-release/2026/11/09/test.html':sourceId==='bleepingcomputer'?'/news/security/new-patch/':sourceId==='openai'?'/index/new-tool/':'/2026/11/09/new-tool/';return {sourceId,sourceName:s.name,sourceType:s.sourceType||'official-publisher',sourceUrl:'https://'+s.hosts[0]+path,headline,sourceText,category:s.category,sourcePublishedAt:at,evidence};}
test('large and smaller company ticker announcements qualify equally as Updates',()=>{
 for(const symbol of ['AAPL','SMALL']){const c=candidate('globenewswire','Example reports third quarter financial results',`Example (NASDAQ: ${symbol}) reported quarterly revenue and financial results in its latest company announcement published today.`);c.tickers=extractNewsTickers(c.sourceText);const r=assessCandidate(c,{now});assert.equal(r.decision,'publish');assert.equal(r.classification,'update');assert.equal(r.category,'markets');assert.match(r.summary,/^Company announcement:/);}
});
test('ticker labels require explicit exchange notation, never inferred company names',()=>{
 assert.deepEqual(extractNewsTickers('Apple and Nvidia shares rose; AAPL NVDA $FAKE'),[]);
 assert.deepEqual(extractNewsTickers('NASDAQ: NVDA and NYSE: BRK.B; NASDAQ: NVDA'),[{symbol:'NVDA',exchange:'NASDAQ'},{symbol:'BRK.B',exchange:'NYSE'}]);
 assert.deepEqual(extractNewsTickers('NASDAQ: revenue'),[]);
 const c=candidate('globenewswire','Example announces quarterly results','Example published new financial results with revenue and earnings information for its investors today.');assert.equal(assessCandidate(c,{now}).decision,'review');
});
test('official product features and developer releases publish as regular Updates',()=>{
 for(const c of [candidate('openai','Introducing new ChatGPT features','New ChatGPT features are now available, including improvements to developer tools and software workflows for customers.'),candidate('github','Copilot code review API management updates','GitHub Copilot code review settings can now be managed through the REST and GraphQL APIs for enterprise users.')]){const r=assessCandidate(c,{now});assert.equal(r.decision,'publish');assert.equal(r.classification,'update');assert.equal(r.category,'ai-tech');}
});
test('security patches and useful guidance are Updates, never inflated into Breaking',()=>{
 for(const c of [candidate('bleepingcomputer','Vendor releases security patch for CVE-2026-12345','The vendor released a security patch for CVE-2026-12345, affecting supported products and addressing the disclosed vulnerability.'),candidate('microsoft-security','Tips for protecting accounts from phishing','Microsoft explains how to protect accounts using strong authentication against phishing and malware. Windows is under active attack.')]){
 if(c.sourceId==='microsoft-security')c.sourceUrl='https://www.microsoft.com/en-us/security/blog/tips/';const r=assessCandidate(c,{now});assert.equal(r.decision,'publish');assert.equal(r.classification,'update');assert.equal(r.category,'security');}
});
test('broader coverage still blocks rumors, stale articles and promotional stock alerts',()=>{
 const c=candidate('globenewswire','Example reports financial results','Example (NASDAQ: SMALL) reported revenue and earnings with supporting details in its latest financial results.');c.tickers=extractNewsTickers(c.sourceText);
 assert.equal(assessCandidate({...c,headline:'Investor alert: buy now before earnings'},{now}).decision,'review');
 assert.equal(assessCandidate({...c,headline:'Example to announce third quarter financial results next week'},{now}).decision,'review');
 assert.equal(assessCandidate({...c,sourcePublishedAt:new Date(now-49*3600000).toISOString()},{now}).decision,'reject');
 assert.equal(assessCandidate({...c,sourceText:c.sourceText+' Unconfirmed merger rumors.'},{now}).decision,'review');
 assert.equal(assessCandidate({...c,evidence:{...evidence,verified:false}},{now}).decision,'review');
});
test('issuer ticker is extracted from confirmed article content with original timestamps',()=>{
 const source=NEWS_SOURCES.find(s=>s.id==='globenewswire');const xml=`<rss><item><title>Example reports financial results</title><link>https://www.globenewswire.com/news-release/2026/11/09/test.html</link><pubDate>${at}</pubDate><description>Example reports financial results.</description></item></rss>`;const [c]=parseFeed(xml,source);
 const body='Example (NASDAQ: SMALL) reported financial results for the third quarter, including revenue growth and details of its latest quarterly earnings.';
 const verified=verifyArticle(c,`<article><h1>${c.headline}</h1><p>${body}</p></article><script>{"datePublished":"${at}"}</script>`);
 assert.equal(verified.evidence.verified,true);assert.equal(verified.sourceType,'issuer-release');assert.deepEqual(verified.tickers,[{symbol:'SMALL',exchange:'NASDAQ'}]);
});

test('HTML doctypes inside RSS CDATA are content, not XML entity declarations',()=>{
 const source=NEWS_SOURCES.find(s=>s.id==='github');
 const xml=`<rss><item><title>API update</title><link>https://github.blog/changelog/new-api</link><pubDate>${at}</pubDate><description><![CDATA[<!DOCTYPE html><p>A new developer feature.</p>]]></description></item></rss>`;
 assert.equal(parseFeed(xml,source).length,1);
 assert.throws(()=>parseFeed('<!DOCTYPE rss><rss/>',source));
});

test('feed checks progress past recorded URLs while keeping article fetches bounded',async()=>{
 const source=NEWS_SOURCES.find(s=>s.id==='github');const calls=[];
 const summary='This developer feature updates the GitHub API with additional capabilities for software teams and enterprise administrators.';
 const item=i=>`<item><title>GitHub API update ${i}</title><link>https://github.blog/changelog/update-${i}</link><pubDate>${at}</pubDate><description>${summary}</description></item>`;
 const result=await collectCandidates({now,knownUrls:['https://github.blog/changelog/update-0'],fetcher:async url=>{
  calls.push(url);if(url===source.feedUrl)return new Response('<rss>'+[0,1,2,3,4].map(item).join('')+'</rss>');
  if(NEWS_SOURCES.some(s=>s.feedUrl===url))return new Response('<rss/>');
  const i=url.match(/update-(\d+)/)?.[1];return new Response(`<article><h1>GitHub API update ${i}</h1><p>${summary}</p></article><script>{"datePublished":"${at}"}</script>`);
 }});
 assert.equal(calls.includes('https://github.blog/changelog/update-0'),false);
 assert.deepEqual(result.candidates.map(c=>c.headline).sort(),['GitHub API update 1','GitHub API update 2','GitHub API update 3']);
 assert.ok(result.candidates.every(c=>c.evidence.verified));
});
