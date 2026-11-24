import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeNewsStoryPageHandler, renderNewsStoryPage } from '../server/news-story-page.mjs';
import { makeNewsHandler } from '../server/news-handler.mjs';
import { makePublicRouter } from '../server/public-router.mjs';
import { newsArticleMarkup, newsIdFromPath, newsSlug, newsStoryPath } from '../src/lib/news-story.mjs';
import { buildSitemapEntries } from '../server/sitemap.mjs';

const template = '<html><head><title>News · Digivated</title><meta name="description" content="x"><link rel="canonical" href="https://digivated.com/news"><meta property="og:url" content="https://digivated.com/news"><meta property="og:type" content="website"><meta property="og:title" content="x"><meta property="og:description" content="x"><meta name="twitter:title" content="x"><meta name="twitter:description" content="x"><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","url":"https://digivated.com/news"}]}</script></head><body><section data-news-story-page><div class="news-story-root" data-news-story-root aria-live="polite"><p class="news-story-loading" data-news-story-status role="status">Loading story…</p></div></section></body></html>';
const at = '2026-11-23T12:00:00.000Z';
const story = { id:'a'.repeat(24), headline:'Microsoft patches a <critical> Windows flaw', summary:'Microsoft shipped a fix.\n\nAdmins should update today.', category:'security', classification:'update', sourceName:'Microsoft Security', sourceUrl:'https://www.microsoft.com/en-us/security/blog/post', sourcePublishedAt:at, publishedAt:at, updatedAt:at, tickers:[{ exchange:'NASDAQ', symbol:'MSFT' }] };
const other = { ...story, id:'b'.repeat(24), headline:'Another security story', category:'security' };
const market = { ...story, id:'c'.repeat(24), headline:'Rates hold steady', category:'markets' };
const records = { [story.id]:story, [other.id]:other, [market.id]:market };
const published = [story.id, market.id, other.id];
const redis = async ([command, ...args]) => {
  if (command === 'GET') return records[args[0].split(':').at(-1)] ? JSON.stringify(records[args[0].split(':').at(-1)]) : null;
  if (command === 'ZSCORE') return published.includes(args[1]) ? '1' : null;
  if (command === 'ZREVRANGE') return published;
  if (command === 'MGET') return args.map(key => records[key.split(':').at(-1)] ? JSON.stringify(records[key.split(':').at(-1)]) : null);
  return null;
};
const path = newsStoryPath(story);
async function get(url, deps = { redis, template, now:() => Date.parse(at) + 3600000 }) {
  const headers = {}; let body = ''; const res = { setHeader:(k, v) => headers[k.toLowerCase()] = v, end:value => body = value ?? '' };
  await makeNewsStoryPageHandler(deps)({ method:'GET', url, headers:{} }, res);
  return { status:res.statusCode, headers, body };
}

test('story links carry a readable slug and round-trip to the id', () => {
  assert.equal(newsSlug('AI & Chips: what’s next?'), 'ai-and-chips-what-s-next');
  assert.equal(path, `/news/microsoft-patches-a-critical-windows-flaw-${story.id}`);
  assert.equal(newsIdFromPath(path), story.id);
  assert.equal(newsIdFromPath(`/news/${story.id}`), story.id);
  assert.equal(newsIdFromPath('/news/story'), '');
  assert.equal(newsIdFromPath('/news'), '');
});

test('story pages arrive fully rendered with their own title, canonical and NewsArticle data', async () => {
  const { status, body, headers } = await get(path);
  assert.equal(status, 200);
  assert.equal(headers['x-robots-tag'], undefined);
  assert.match(body, /<title>Microsoft patches a &lt;critical&gt; Windows flaw · Digivated News<\/title>/);
  assert.match(body, new RegExp(`<link rel="canonical" href="https://digivated.com${path}">`));
  assert.match(body, /property="og:type" content="article"/);
  assert.match(body, /data-news-story-ready/);
  assert.ok(!body.includes('Loading story'));
  assert.match(body, /<h1 id="news-article-title">Microsoft patches a &lt;critical&gt; Windows flaw<\/h1>/);
  assert.match(body, /<p>Admins should update today.<\/p>/);
  assert.match(body, /href="https:\/\/www.microsoft.com\/en-us\/security\/blog\/post" target="_blank" rel="noopener noreferrer"/);
  assert.match(body, /NASDAQ: MSFT/);
  assert.ok(body.indexOf('Another security story') < body.indexOf('Rates hold steady'), 'same-topic stories come first');
  const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(body)[1]);
  const article = data['@graph'].find(node => node['@type'] === 'NewsArticle');
  assert.equal(article.headline, story.headline);
  assert.equal(article.isBasedOn, story.sourceUrl);
});

test('old or bare story links redirect to the one canonical address', async () => {
  const { status, headers } = await get(`/news/${story.id}`);
  assert.equal(status, 308);
  assert.equal(headers.location, path);
});

test('missing stories are not indexed and say so plainly', async () => {
  const { status, body, headers } = await get(`/news/gone-${'d'.repeat(24)}`);
  assert.equal(status, 404);
  assert.equal(headers['x-robots-tag'], 'noindex, follow');
  assert.match(body, /noindex,follow/);
  assert.match(body, /This story is no longer here/);
});

test('local previews without storage get the template for the browser to fill', async () => {
  const { status, body } = await get(path, { template, env:{} });
  assert.equal(status, 200);
  assert.equal(body, template);
});

test('the router sends story paths to the story page and the API returns one story', async () => {
  let routed = '';
  makePublicRouter({ 'news-story-page':() => { routed = 'story'; } })({ url:path }, {});
  assert.equal(routed, 'story');
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rule = config.rewrites.find(item => item.destination.startsWith('/api/news-story-page'));
  assert.ok(rule && rule.source.startsWith('/news/:slug'));
  const headers = {}; let body = '';
  const res = { setHeader:(k, v) => headers[k] = v, end:value => body = value };
  await makeNewsHandler({ redis, now:() => Date.parse(at) })({ method:'GET', url:`/api/news?id=${story.id}` }, res);
  assert.equal(res.statusCode, 200);
  const data = JSON.parse(body);
  assert.equal(data.story.id, story.id);
  assert.equal(data.related.length, 2);
  await makeNewsHandler({ redis })({ method:'GET', url:'/api/news?id=nope' }, res);
  assert.equal(res.statusCode, 404);
});

test('article markup escapes everything it prints', () => {
  const html = newsArticleMarkup({ ...story, sourceName:'<img src=x>', summary:'"quoted" <b>' });
  assert.ok(!html.includes('<img src=x>'));
  assert.ok(!html.includes('<b>'));
  assert.ok(renderNewsStoryPage(template, { id:'x', status:404 }).includes('noindex'));
});

test('the sitemap lists each story page', () => {
  const entries = buildSitemapEntries({ newsStories:[story, { id:'bad', headline:'x' }] });
  assert.ok(entries.some(entry => entry.loc === `https://digivated.com${path}`));
  assert.ok(!entries.some(entry => entry.loc.includes('/news/x')));
});
