import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { buildSitemapEntries, collectSitemapEntries, renderSitemap, sitemapLastmod, staticPublicPages } from '../server/sitemap.mjs';

const creator = '123e4567-e89b-42d3-a456-426614174000';

test('verification files are exact root responses', () => {
  const google = readFileSync(new URL('../public/googlef8b001e22ee0d4b9.html', import.meta.url));
  assert.equal(google.toString('utf8'), 'google-site-verification: googlef8b001e22ee0d4b9.html');
  const keys = readdirSync(new URL('../public/', import.meta.url)).filter(name => /^[a-f0-9]{32}\.txt$/.test(name));
  assert.equal(keys.length, 1);
  const key = keys[0].slice(0, -4);
  assert.equal(readFileSync(new URL(`../public/${keys[0]}`, import.meta.url)).toString('utf8'), key);
});

test('sitemap lastmod uses a real UTC date and skips invalid or future values', () => {
  assert.equal(sitemapLastmod('2026-03-04T15:04:00.000Z', Date.parse('2026-11-11T00:00:00.000Z')), '2026-03-04');
  assert.equal(sitemapLastmod('not-a-date'), '');
  assert.equal(sitemapLastmod('2099-01-01', Date.parse('2026-11-11T00:00:00.000Z')), '');
});

test('sitemap lists public pages and drops private, redirected, and member-only URLs', () => {
  const entries = buildSitemapEntries({
    resources: [{ status: 'published', slug: 'clear-writing', date: '2026-01-15' }, { status: 'draft', slug: 'secret-draft' }, { status: 'published', slug: 'guides' }],
    projects: [
      { pageUrl: '/projects/fieldnotes-1', publishedAt: '2026-04-02T12:00:00.000Z' },
      { pageUrl: '/projects/listing/project-two', date: '2026-05-01' },
      { pageUrl: '/admin' },
      { pageUrl: '/api/projects' },
      { pageUrl: 'https://example.com/elsewhere' },
    ],
    creators: [{ id: creator, updatedAt: '2026-06-07T08:00:00.000Z' }, { id: 'not-a-profile', updatedAt: '2026-06-07' }],
    liveResources: [{ url: '/resources/read?slug=paused-article', date: '2026-01-01' }],
    newsUpdatedAt: '2026-07-08T00:00:00.000Z',
    articlesVisible: false,
  });
  const locs = entries.map(entry => entry.loc);
  assert.ok(locs.includes('https://digivated.com/discover'));
  assert.ok(locs.includes('https://digivated.com/toolkit'));
  assert.ok(locs.includes('https://digivated.com/access'));
  assert.ok(locs.includes('https://digivated.com/resources/clear-writing'));
  assert.ok(locs.includes('https://digivated.com/projects/fieldnotes-1'));
  assert.ok(locs.includes('https://digivated.com/projects/listing/project-two'));
  assert.ok(locs.includes(`https://digivated.com/creator?id=${creator}`));
  assert.equal(entries.find(entry => entry.loc === 'https://digivated.com/news').lastmod, '2026-07-08');
  assert.equal(entries.find(entry => entry.loc === 'https://digivated.com/projects/fieldnotes-1').lastmod, '2026-04-02');
  assert.equal(entries.find(entry => entry.loc === `https://digivated.com/creator?id=${creator}`).lastmod, '2026-06-07');
  const xml = renderSitemap(entries);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/digivated\.com\/projects\/fieldnotes-1<\/loc><lastmod>2026-04-02<\/lastmod>/);
  assert.doesNotMatch(xml, /secret-draft|paused-article|example\.com|\/admin|\/api\/|\/account|\/login|\/inbox|\/saved|connect-x|research\.html|\/carousels/);
});

test('renderer escapes query separators', () => {
  const xml = renderSitemap([{ loc: 'https://digivated.com/resources/read?slug=guide&extra=1', lastmod: '2026-01-02' }]);
  assert.match(xml, /slug=guide&amp;extra=1/);
  assert.doesNotMatch(xml, /slug=guide&extra/);
});

test('dynamic sitemap reads public projects, creators, and news dates only', async () => {
  const published = {
    id: 'project-one', status: 'approved', consent: true, image: 'present', url: 'https://example.com/project',
    name: 'Fieldnotes', creator: 'Ada', description: 'A reviewed project with a public listing page.', category: 'Apps',
    date: '2026-02-02T00:00:00.000Z', publishedAt: '2026-03-03T00:00:00.000Z',
  };
  const hidden = { ...published, id: 'project-two', status: 'pending', image: '' };
  const strings = {
    'digivated:submission:project-one': JSON.stringify(published),
    'digivated:submission:project-two': JSON.stringify(hidden),
    [`digivated:creator:profile:${creator}`]: JSON.stringify({ public: true, updatedAt: '2026-08-09T00:00:00.000Z', email: 'hidden@example.com' }),
    'digivated:creator:profile:123e4567-e89b-42d3-a456-426614174001': JSON.stringify({ public: false, updatedAt: '2026-08-09T00:00:00.000Z' }),
    'digivated:news:public:story': JSON.stringify({ publishedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z', summary: 'member text' }),
    'digivated:resource:paused': JSON.stringify({ id: 'paused', status: 'published', title: 'Paused', description: 'Hidden while articles are paused.', category: 'Guides', publishedDate: '2026-01-01', readingTime: 4, content: 'Body', related: [] }),
  };
  const zsets = {
    'digivated:public:submissions': ['project-one', 'project-two'],
    'digivated:creator:public': [creator, '123e4567-e89b-42d3-a456-426614174001'],
    'digivated:news:index:published': ['story'],
    'digivated:public:resources': ['paused'],
  };
  const redis = async command => {
    const [op, ...args] = command;
    if (op === 'ZCARD') return zsets[args[0]]?.length || 0;
    if (op === 'ZREVRANGE') return (zsets[args[0]] || []).slice(Number(args[1]), Number(args[2]) + 1);
    if (op === 'MGET') return args.map(key => strings[key] ?? null);
    throw new Error(`unexpected ${op}`);
  };
  const entries = await collectSitemapEntries({
    resources: [],
    env: { SUBMISSIONS_REDIS_REST_URL: 'https://redis.example', SUBMISSIONS_REDIS_REST_TOKEN: 'token' },
    redisFactory: () => redis,
  });
  const locs = entries.map(entry => entry.loc);
  assert.ok(locs.includes('https://digivated.com/projects/listing/project-one'));
  assert.equal(locs.includes('https://digivated.com/projects/listing/project-two'), false);
  assert.ok(locs.includes(`https://digivated.com/creator?id=${creator}`));
  assert.equal(locs.filter(loc => loc.startsWith('https://digivated.com/creator?id=')).length, 1);
  assert.equal(locs.some(loc => loc.includes('paused')), false);
  assert.equal(entries.find(entry => entry.loc === 'https://digivated.com/news').lastmod, '2026-09-02');
  assert.equal(JSON.stringify(entries).includes('hidden@example.com'), false);
  assert.equal(entries.filter(entry => staticPublicPages.some(path => entry.loc === new URL(path, 'https://digivated.com').href)).length, staticPublicPages.length);
});

test('sitemap stays static when public storage is not configured', async () => {
  const entries = await collectSitemapEntries({ resources: [], env: {} });
  assert.equal(entries.length, staticPublicPages.length);
  assert.equal(entries.some(entry => entry.loc.includes('/projects/')), false);
});

test('preview sitemap reads the public project and creator responses', async () => {
  const pages = {
    'https://digivated.com/api/projects?offset=0': { items: [{ pageUrl: '/projects/listing/project-one', date: '2026-03-03', email: 'hidden@example.com' }, { pageUrl: '/account' }], next: 100 },
    'https://digivated.com/api/projects?offset=100': { items: [{ pageUrl: '/projects/fieldnotes-1', publishedAt: '2026-04-02T00:00:00.000Z' }], next: null },
    'https://digivated.com/api/creator-profile?action=discover': { creators: [{ id: creator, name: 'Ada' }, { id: 'private' }] },
    'https://digivated.com/api/news': { items: [{ publishedAt: '2026-05-05T00:00:00.000Z' }], featured: { publishedAt: '2026-05-06T00:00:00.000Z' } },
  };
  const fetcher = async url => ({ ok: true, json: async () => pages[url] });
  const entries = await collectSitemapEntries({ resources: [], env: {}, fetcher });
  const locs = entries.map(entry => entry.loc);
  assert.ok(locs.includes('https://digivated.com/projects/listing/project-one'));
  assert.ok(locs.includes('https://digivated.com/projects/fieldnotes-1'));
  assert.ok(locs.includes(`https://digivated.com/creator?id=${creator}`));
  assert.equal(locs.includes('https://digivated.com/account'), false);
  assert.equal(locs.filter(loc => loc.includes('/creator?id=')).length, 1);
  assert.equal(entries.find(entry => entry.loc === 'https://digivated.com/news').lastmod, '2026-05-06');
  assert.equal(JSON.stringify(entries).includes('hidden@example.com'), false);
});
