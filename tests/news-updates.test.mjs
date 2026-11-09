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
 assert.equal(assessCandidate({...c,sourcePublishedAt:new Date(now-8*24*3600000).toISOString()},{now}).decision,'reject');
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

test('new reporting feeds keep their article hosts restricted',()=>{
 for(const id of ['ars-technica','the-verge','securityweek','the-register','marketwatch','nasdaq-markets'])assert.ok(NEWS_SOURCES.some(source=>source.id===id));
 const marketwatch=NEWS_SOURCES.find(source=>source.id==='marketwatch');
 assert.equal(parseFeed('<rss><item><title>Markets rise</title><link>https://www.marketwatch.com/not-an-article</link></item></rss>',marketwatch).length,0);
});

test('article metadata can confirm an original time missing from a feed',()=>{
 const source=NEWS_SOURCES.find(s=>s.id==='the-verge'),published=new Date(now-6*24*3600000).toISOString();
 const [entry]=parseFeed('<feed><entry><title>New developer tool launches</title><link href="https://www.theverge.com/tech/123/new-tool"/><summary>A new developer tool is now available to software builders.</summary></entry></feed>',source);
 assert.equal(entry.sourcePublishedAt,null);
 const article=verifyArticle(entry,`<article><h1>New developer tool launches</h1><p>The new developer tool is now available to software builders and includes updates to the development workflow used by teams across the industry.</p></article><script>{"datePublished":"${published}"}</script>`);
 assert.equal(article.evidence.verified,true);
 assert.equal(article.sourcePublishedAt,published);
 assert.equal(assessCandidate(article,{now}).decision,'publish');
 assert.equal(assessCandidate({...article,sourcePublishedAt:new Date(now-8*24*3600000).toISOString()},{now}).decision,'reject');
});

test('independent reporting is an Update even for a major recent claim',()=>{
 const c=candidate('the-verge','Windows vulnerability actively exploited','Microsoft confirmed attackers are actively exploiting a Windows vulnerability and released an emergency security update to protect affected organizations.');
 assert.equal(assessCandidate(c,{now}).classification,'update');
});
test('broad sources do not publish unrelated entertainment or misclassify Cybertruck',()=>{
 const music=candidate('the-verge','Soul Glo releases a hardcore record','The band released a new album that explores its musical influences and its latest run of live performances.');
 assert.equal(assessCandidate(music,{now}).decision,'reject');
 const cybertruck=candidate('techcrunch','TechCrunch Mobility: The Cybertruck experiment is over','The publication looks back at the vehicle experiment and explains why the story is changing for car buyers.');
 assert.equal(assessCandidate(cybertruck,{now}).decision,'reject');
 const software=candidate('techcrunch','Tesla announces Cybertruck software update','Tesla announced a software update for its electric vehicle with new features and improvements to the vehicle interface.');
 assert.equal(assessCandidate(software,{now}).category,'ai-tech');
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
 assert.deepEqual(result.candidates.map(c=>c.headline).sort(),['GitHub API update 1','GitHub API update 2','GitHub API update 3','GitHub API update 4']);
 assert.ok(result.candidates.every(c=>c.evidence.verified));
});
