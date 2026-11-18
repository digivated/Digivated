import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeThreadPageHandler, renderThreadPage, threadSlugFromPath } from '../server/thread-page.mjs';
import { makePublicRouter } from '../server/public-router.mjs';

const template = '<html><head><title>Thread · Digivated</title><meta name="description" content="A discussion on Digivated Threads."><link rel="canonical" href="https://digivated.com/threads/thread"><meta property="og:url" content="https://digivated.com/threads/thread"><meta property="og:title" content="Thread · Digivated"><meta property="og:description" content="x"><meta name="twitter:title" content="Thread"><meta name="twitter:description" content="x"><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","url":"https://digivated.com/threads/thread"}]}</script></head><body><h1 data-thread-title></h1></body></html>';
const thread = { id: 'abc12345-0000-4000-8000-000000000000', slug: 'roast-my-landing-page-abc12345', title: 'Roast my landing page <please>', body: 'I rebuilt the hero and pricing.\n\nWhat would you change first?', forum: 'feedback', authorName: 'Ana', authorProfileUrl: '/creator?id=x', createdAt: '2026-11-10T12:00:00.000Z', status: 'published' };
const store = { 'digivated:thread:slug:roast-my-landing-page-abc12345': thread.id, [`digivated:thread:${thread.id}`]: JSON.stringify(thread), 'digivated:thread:slug:gone-thread-11111111': 'gone', 'digivated:thread:gone': JSON.stringify({ ...thread, slug: 'gone-thread-11111111', status: 'removed' }) };
const redis = async ([command, key]) => command === 'GET' ? store[key] ?? null : null;
async function get(url, deps = { redis, template }) {
  const headers = {}; let body = ''; const res = { setHeader: (k, v) => headers[k.toLowerCase()] = v, end: value => body = value };
  await makeThreadPageHandler(deps)({ method: 'GET', url, headers: {} }, res);
  return { status: res.statusCode, headers, body };
}

test('thread pages ship their own title, description, canonical and structured data', async () => {
  const { status, body, headers } = await get('/threads/roast-my-landing-page-abc12345');
  assert.equal(status, 200);
  assert.equal(headers['x-robots-tag'], undefined);
  assert.match(body, /<title>Roast my landing page &lt;please&gt; · Digivated Threads<\/title>/);
  assert.match(body, /<link rel="canonical" href="https:\/\/digivated.com\/threads\/roast-my-landing-page-abc12345">/);
  assert.match(body, /property="og:url" content="https:\/\/digivated.com\/threads\/roast-my-landing-page-abc12345"/);
  assert.match(body, /name="description" content="I rebuilt the hero and pricing. What would you change first\?"/);
  assert.ok(!body.includes('noindex'));
  const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(body)[1]);
  const post = data['@graph'].find(node => node['@type'] === 'DiscussionForumPosting');
  assert.equal(post.headline, thread.title);
  assert.equal(post.author.name, 'Ana');
  assert.ok(!/<\/script>/.test(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(body)[1]));
});

test('missing or removed threads are not indexed', async () => {
  for (const [url, code] of [['/threads/no-such-thread-1', 404], ['/threads/gone-thread-11111111', 410]]) {
    const { status, body, headers } = await get(url);
    assert.equal(status, code);
    assert.equal(headers['x-robots-tag'], 'noindex, follow');
    assert.match(body, /noindex,follow/);
  }
});

test('the rewrite destination URL also works, and reserved paths are not threads', async () => {
  assert.equal((await get('/api/thread-page?slug=roast-my-landing-page-abc12345')).status, 200);
  assert.equal(threadSlugFromPath('/threads/new'), '');
  assert.equal(threadSlugFromPath('/threads/thread'), '');
  assert.equal(threadSlugFromPath('/threads/Bad_Slug'), '');
  let routed = '';
  const router = makePublicRouter({ 'thread-page': () => { routed = 'thread'; } });
  router({ url: '/threads/roast-my-landing-page-abc12345' }, {});
  assert.equal(routed, 'thread');
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(config.rewrites.some(rule => rule.destination === '/api/thread-page?slug=:slug' && rule.source.startsWith('/threads/:slug')));
});

test('without storage the template is served unchanged so the page still loads', async () => {
  const { status, body } = await get('/threads/anything-here', { template, env: {} });
  assert.equal(status, 200);
  assert.equal(body, template);
  assert.ok(renderThreadPage(template, { slug: 'x', thread: null, status: 404 }).includes('noindex'));
});
