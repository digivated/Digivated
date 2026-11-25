import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCandidate } from '../server/news-verification.mjs';
import { NEWS_SOURCES } from '../server/news-sources.mjs';
import { runNewsIngest } from '../server/news-pipeline.mjs';
import { renderNewsStoryPage } from '../server/news-story-page.mjs';
import { renderNewsIndex } from '../server/news-feed-page.mjs';
import { makeNewsHandler } from '../server/news-handler.mjs';
import {
  clusterNewsItems,
  diversifyBySource,
  isCorporateFluff,
  isSmallIssuerWire,
  nextNewsCheck,
  normalizeHeadline,
  presentHeadline,
  renderNewsFeed,
  sameNewsEvent,
  sourceSlotOpen,
  truncateOnWord,
  whyItMattersLine,
} from '../src/lib/news-editorial.mjs';

const now = Date.parse('2026-11-24T18:00:00.000Z');

test('headlines become third person, sentence case, and lose wire furniture', () => {
  assert.equal(
    normalizeHeadline("We're launching Humanity's First Exam and a Kaggle hackathon.", 'Google'),
    "Google is launching Humanity's First Exam and a Kaggle hackathon",
  );
  assert.equal(
    normalizeHeadline('HOLLYWOOD, Fla., Nov. 16, 2026 /PRNewswire/ -- EXAMPLE INC. REPORTS Q3 RESULTS', 'PR Newswire'),
    'Example Inc. reports Q3 results',
  );
  assert.equal(normalizeHeadline('Markets rise — then pause.', 'MarketWatch'), 'Markets rise - then pause');
  assert.equal(normalizeHeadline('Microsoft confirms a Windows fix.', 'Microsoft Security'), 'Microsoft confirms a Windows fix');
});

test('owner-edited headlines are left exactly as saved', () => {
  const record = { headline: "We're keeping this.", summary: 'Owner copy — stays.', summaryMethod: 'owner-edited', sourceName: 'Google' };
  assert.equal(presentHeadline(record), "We're keeping this.");
});

test('descriptions truncate on a word boundary', () => {
  const text = 'Current frontrunner in a very long summary that would otherwise be cut mid-word at the old fixed limit for search and social cards.';
  const cut = truncateOnWord(text, 40);
  assert.ok(cut.length <= 40);
  assert.ok(!cut.endsWith('fron'));
  assert.match(cut, /…$/);
  assert.equal(truncateOnWord('Short line', 160), 'Short line');
});

test('corporate blog fluff and small-issuer wire earnings are filtered, real stories stay', () => {
  const at = new Date(now - 3600000).toISOString();
  const evidence = { verified: true, timePrecision: 'second', originalPublicationTimeConfirmed: true, headlineMatched: true, summarySupported: true, articlePublishedAt: at };
  const google = NEWS_SOURCES.find(source => source.id === 'google');
  const fluff = {
    sourceId: 'google', sourceName: 'Google', sourceType: 'official-publisher', category: 'ai-tech',
    sourceUrl: 'https://blog.google/inside-google/life-at-google/golden-state/',
    headline: "How Gemini is changing the game for Golden State's organization and fans",
    sourceText: 'A first-person look at how the partnership shows up for fans and the organization across the season.',
    sourcePublishedAt: at, evidence,
  };
  assert.equal(isCorporateFluff(fluff), true);
  assert.equal(assessCandidate(fluff, { now }).decision, 'reject');
  const launch = {
    ...fluff,
    sourceUrl: 'https://blog.google/products/gemini/new-model/',
    headline: 'Introducing Gemini 3 for developers',
    sourceText: 'Google is releasing Gemini 3, a new AI model with developer tools, an API, and app features that are now available.',
  };
  assert.equal(isCorporateFluff(launch), false);
  assert.equal(assessCandidate(launch, { now }).decision, 'publish');
  const wire = NEWS_SOURCES.find(source => source.id === 'prnewswire-earnings');
  const small = {
    sourceId: wire.id, sourceName: wire.name, sourceType: 'issuer-release', category: 'markets',
    sourceUrl: 'https://www.prnewswire.com/news-releases/example-2026.html',
    headline: 'HOLLYWOOD, FLA., NOV. 16, 2026 /PRNEWSWIRE/ -- HOLLYWOOD INC. REPORTS THIRD QUARTER RESULTS',
    sourceText: 'HOLLYWOOD, Fla., Nov. 16, 2026 /PRNewswire/ Hollywood Inc. (NASDAQ: TINY) reported quarterly revenue and earnings for the period.',
    tickers: [{ symbol: 'TINY', exchange: 'NASDAQ' }],
    sourcePublishedAt: at, evidence,
  };
  assert.equal(isSmallIssuerWire(small), true);
  assert.equal(assessCandidate(small, { now }).decision, 'reject');
  const listed = {
    ...small,
    headline: 'Example reports third quarter financial results',
    sourceText: 'Example (NASDAQ: SMALL) reported quarterly revenue and financial results in its latest company announcement published today.',
    tickers: [{ symbol: 'SMALL', exchange: 'NASDAQ' }],
  };
  assert.equal(isSmallIssuerWire(listed), false);
  assert.equal(assessCandidate(listed, { now }).decision, 'publish');
  assert.equal(google.id, 'google');
});

test('the same event from two outlets becomes one card with source links', () => {
  const at = new Date(now - 2 * 3600000).toISOString();
  const later = new Date(now - 3600000).toISOString();
  const techcrunch = { id: 'a'.repeat(24), category: 'ai-tech', sourceType: 'independent-reporting', sourceName: 'TechCrunch', sourceUrl: 'https://techcrunch.com/anthropic-claude-ship', sourcePublishedAt: at, importance: 62, headline: 'Anthropic launches Claude Ship to review pull requests' };
  const verge = { id: 'b'.repeat(24), category: 'ai-tech', sourceType: 'independent-reporting', sourceName: 'The Verge', sourceUrl: 'https://www.theverge.com/claude-ship', sourcePublishedAt: later, importance: 62, headline: 'Claude AI can review pull requests and ship fixes on its own now' };
  const other = { id: 'c'.repeat(24), category: 'markets', sourceType: 'independent-reporting', sourceName: 'MarketWatch', sourceUrl: 'https://www.marketwatch.com/story/rates', sourcePublishedAt: later, importance: 50, headline: 'Fed holds interest rates steady for a third meeting' };
  assert.equal(sameNewsEvent(techcrunch, verge), true);
  assert.equal(sameNewsEvent(techcrunch, other), false);
  const [card, rest] = clusterNewsItems([verge, techcrunch, other]);
  assert.equal(card.headline, verge.headline);
  assert.equal(card.alsoCoveredBy.length, 1);
  assert.equal(card.alsoCoveredBy[0].sourceName, 'TechCrunch');
  assert.equal(card.alsoCoveredBy[0].sourceUrl, techcrunch.sourceUrl);
  assert.equal(rest.headline, other.headline);
  assert.equal(rest.alsoCoveredBy, undefined);
});

test('a source cannot crowd the latest window unless the story is important', () => {
  const google = Array.from({ length: 8 }, (_, index) => ({ id: `g${index}`, sourceName: 'Google', importance: 45, sourcePublishedAt: new Date(now - index * 3600000).toISOString() }));
  const others = Array.from({ length: 20 }, (_, index) => ({ id: `v${index}`, sourceName: `Desk ${index}`, importance: 50, sourcePublishedAt: new Date(now - (index + 10) * 3600000).toISOString() }));
  const major = { id: 'major', sourceName: 'Google', importance: 90, sourcePublishedAt: new Date(now - 500).toISOString() };
  const ordered = diversifyBySource([major, ...google, ...others]);
  const firstWindow = ordered.slice(0, 20);
  const shown = firstWindow.filter(item => item.sourceName === 'Google');
  assert.ok(shown.length <= 4);
  assert.ok(shown.some(item => item.id === 'major'));
  assert.equal(ordered.filter(item => item.sourceName === 'Google').length, 9);
  assert.equal(sourceSlotOpen(new Map([['google', 2]]), 'google', 45), false);
  assert.equal(sourceSlotOpen(new Map([['google', 2]]), 'google', 90), true);
});

test('the next check is the following 08:00 or 20:00 UTC slot', () => {
  assert.equal(nextNewsCheck(Date.parse('2026-11-24T18:00:00.000Z')), '2026-11-24T20:00:00.000Z');
  assert.equal(nextNewsCheck(Date.parse('2026-11-24T20:00:00.000Z')), '2026-11-25T08:00:00.000Z');
  assert.equal(nextNewsCheck(Date.parse('2026-11-24T21:30:00.000Z')), '2026-11-25T08:00:00.000Z');
});

test('why it matters is a specific line or an empty hook', () => {
  assert.equal(whyItMattersLine('verified_security_update'), 'A confirmed security fix is out.');
  assert.equal(whyItMattersLine('verified_source_update'), '');
  assert.equal(whyItMattersLine(''), '');
});

test('RSS and Atom feeds escape text and use the story permalink', () => {
  const item = { id: 'd'.repeat(24), headline: 'Rates <hold> & steady', summary: 'The Fed held.', sourceName: 'Federal Reserve', sourceUrl: 'https://www.federalreserve.gov/newsevents/pressreleases/example.htm', sourcePublishedAt: '2026-11-24T15:00:00.000Z', category: 'markets' };
  const rss = renderNewsFeed([item], { now });
  const atom = renderNewsFeed([item], { format: 'atom', now });
  assert.match(rss, /<rss version="2.0"/);
  assert.match(rss, /Rates &lt;hold&gt; &amp; steady/);
  assert.match(rss, /<link>https:\/\/digivated.com\/news\/rates-hold-and-steady-dddddddddddddddddddddddd<\/link>/);
  assert.match(rss, /<pubDate>Tue, 24 Nov 2026 15:00:00 GMT<\/pubDate>/);
  assert.ok(!rss.includes('<hold>'));
  assert.match(atom, /<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/);
  assert.match(atom, /<updated>2026-11-24T15:00:00.000Z<\/updated>/);
});

test('story metadata uses the source time and does not cut a word in half', () => {
  const template = '<html><head><title>News</title><meta name="description" content="x"><link rel="canonical" href="https://digivated.com/news"><meta property="og:url" content="https://digivated.com/news"><meta property="og:type" content="website"><meta property="og:title" content="x"><meta property="og:description" content="x"><meta name="twitter:title" content="x"><meta name="twitter:description" content="x"><script type="application/ld+json">{"@graph":[{"@type":"WebPage"}]}</script></head><body><div data-news-story-root><p data-news-story-status>Loading story…</p></div></body></html>';
  const summary = `${'Current frontrunner '.repeat(12)}and the rest of the briefing.`;
  const story = { id: 'e'.repeat(24), headline: 'A measured markets close', summary, category: 'markets', sourceName: 'MarketWatch', sourceUrl: 'https://www.marketwatch.com/story/close', sourcePublishedAt: '2026-11-20T15:00:00.000Z', publishedAt: '2026-11-24T08:00:00.000Z' };
  const html = renderNewsStoryPage(template, { story, status: 200 });
  const description = /name="description" content="([^"]*)"/.exec(html)[1];
  assert.ok(description.length <= 160);
  assert.ok(!description.endsWith('fron'));
  assert.match(description, /…$/);
  const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
  const article = data['@graph'].find(node => node['@type'] === 'NewsArticle');
  assert.equal(article.datePublished, '2026-11-20T15:00:00.000Z');
  assert.equal(article.dateModified, '2026-11-24T08:00:00.000Z');
});

test('one ingest run caps a single source and still publishes an important extra', async () => {
  const at = new Date(now - 3600000).toISOString();
  const evidence = { verified: true, originalPublicationTimeConfirmed: true, headlineMatched: true, summarySupported: true, timePrecision: 'second' };
  const text = 'Google is releasing a developer tool with API updates, new model features, and software changes that are now available to teams.';
  const headlines = [
    'Google launches Gemini coding tool for developers',
    'Google releases Android privacy controls for devices',
    'Google announces Pixel camera update for phones',
    'Google adds Chrome reading mode for the browser',
    'Introducing Gemini 9',
  ];
  const candidates = headlines.map((headline, index) => ({
    sourceId: 'google', sourceName: 'Google', sourceType: 'official-publisher', category: 'ai-tech',
    sourceUrl: `https://blog.google/products/item-${index}/`,
    headline, sourceText: index === 4 ? 'Introducing Gemini 9, a new flagship model that is now available to developers and customers.' : text,
    sourcePublishedAt: at, evidence,
  }));
  const redis = async command => {
    if (command[0] === 'GET') return null;
    if (command[0] === 'SET') return 'OK';
    if (command[0] === 'ZREVRANGE') return [];
    if (command[0] === 'EVAL') return command[1].includes('previous') ? 'inserted' : 1;
    return null;
  };
  const report = await runNewsIngest({
    env: { NEWS_AUTO_PUBLISH_ENABLED: 'true' },
    redis, now: () => now,
    collect: async () => ({ candidates, sources: [{ status: 'ok' }] }),
    markets: async () => ({ items: [] }),
  });
  assert.equal(report.published, 3);
  assert.equal(report.skipped, 2);
});

test('the public feed orders by source time, skips wire fluff, and reports the next check', async () => {
  const fresh = new Date(now - 2 * 3600000).toISOString();
  const older = new Date(now - 4 * 24 * 3600000).toISOString();
  const wire = {
    id: '1'.repeat(24), category: 'markets', sourceType: 'issuer-release', sourceName: 'PR Newswire', importance: 65,
    headline: 'HOLLYWOOD, FLA., NOV. 16, 2026 /PRNEWSWIRE/ -- TINY CO REPORTS Q3 RESULTS',
    summary: 'HOLLYWOOD, Fla., Nov. 16, 2026 /PRNewswire/ Tiny Co reported earnings.',
    sourceUrl: 'https://www.prnewswire.com/news-releases/tiny.html', sourcePublishedAt: fresh, publishedAt: fresh,
  };
  const recent = {
    id: '2'.repeat(24), category: 'markets', sourceType: 'independent-reporting', sourceName: 'MarketWatch', importance: 50,
    headline: 'Stocks rise after a quiet session', summary: 'Shares finished higher in a quiet session with little fresh economic data.',
    sourceUrl: 'https://www.marketwatch.com/story/quiet', sourcePublishedAt: fresh, publishedAt: fresh,
  };
  const stale = {
    id: '3'.repeat(24), category: 'markets', sourceType: 'independent-reporting', sourceName: 'Nasdaq', importance: 70,
    headline: 'An older markets note', summary: 'An older note that should not outrank a newer markets story.',
    sourceUrl: 'https://www.nasdaq.com/articles/older', sourcePublishedAt: older, publishedAt: fresh,
  };
  const records = { [wire.id]: wire, [recent.id]: recent, [stale.id]: stale };
  const redis = async ([command, ...args]) => {
    if (command === 'ZREVRANGE') return [stale.id, wire.id, recent.id];
    if (command === 'MGET') return args.map(key => JSON.stringify(records[key.split(':').at(-1)]));
    if (command === 'GET' && String(args[0]).endsWith('latest')) return JSON.stringify({ status: 'partial', finishedAt: new Date(now - 4 * 3600000).toISOString() });
    if (command === 'GET' && String(args[0]).endsWith('markets')) return JSON.stringify({ status: 'ok', items: [], updatedAt: fresh });
    return null;
  };
  const headers = {};
  let body = '';
  const res = { setHeader: (key, value) => { headers[key] = value; }, end: value => { body = value; } };
  await makeNewsHandler({ redis, env: {}, now: () => now })({ method: 'GET', url: '/api/news?category=markets' }, res);
  const data = JSON.parse(body);
  assert.deepEqual(data.items.map(item => item.id), [recent.id, stale.id]);
  assert.equal(data.featured?.id, recent.id);
  assert.equal(data.pipeline.status, 'partial');
  assert.equal(data.pipeline.nextCheckAt, '2026-11-24T20:00:00.000Z');
  assert.equal(headers['Cache-Control'].includes('no-store'), true);
});

test('the news index can be server rendered without a loading shell', () => {
  const template = '<html><head><title>News</title><script type="application/json" id="news-boot"></script></head><body><p class="news-access-status" data-news-access-status role="status">Loading stories…</p><nav class="news-toolbar" hidden></nav><div class="news-layout" hidden><p class="news-status" data-news-status role="status">Loading the latest stories…</p><div class="news-feed" data-news-feed aria-busy="true"></div></div></body></html>';
  const story = { id: 'a'.repeat(24), headline: 'A real story', summary: 'The short version.', category: 'security', sourceName: 'BleepingComputer' };
  const html = renderNewsIndex(template, { items: [story], category: 'all', boot: { items: [story], category: 'all', q: '', stock: '' } });
  assert.equal(html.includes('Loading stories'), false);
  assert.match(html, /A real story/);
  assert.match(html, /id="news-boot">\{/);
  assert.equal(html.includes('news-toolbar" hidden'), false);
});
