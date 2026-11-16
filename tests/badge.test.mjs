import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBadgeHandler, renderBadge, compactCount } from '../server/badge.mjs';
import { BADGE_STYLES, badgeSnippet, badgeSnippets } from '../server/badge-snippets.mjs';
import { hasProjectBadge } from '../server/project-site.mjs';
import { makePublicRouter, defaultPublicHandlers } from '../server/public-router.mjs';

const id = '4ad90c9b-5666-482d-899c-d0d3ef41ee46';
function call(handler, url, method = 'GET') {
  return new Promise(resolve => {
    const headers = {};
    const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, end: body => resolve({ status: res.statusCode, headers, body: body ?? '' }) };
    handler({ method, url, headers: {} }, res);
  });
}

test('every badge style verifies, including the original text link', () => {
  assert.deepEqual(BADGE_STYLES.map(s => s.key), ['dark', 'light', 'terminal', 'text']);
  for (const [style, html] of Object.entries(badgeSnippets(id))) {
    assert.equal(hasProjectBadge(`<footer>${html}</footer>`, id), true, style);
    assert.equal(hasProjectBadge(`<!--${html}-->`, id), false, style);
    assert.equal(hasProjectBadge(html, 'someone-else'), false, style);
  }
  assert.equal(badgeSnippet(id, 'text'), `<a href="https://digivated.com/projects/listing/${id}" data-digivated-project="${id}">[ listed on Digivated ]</a>`);
  assert.match(badgeSnippet(id, 'nonsense'), /theme=dark/);
});

test('badge SVG shows the live count, falls back cleanly and is safe to embed', async () => {
  assert.equal(compactCount(482), '482');
  assert.equal(compactCount(1234), '1.2k');
  assert.equal(compactCount(25000), '25k');
  for (const theme of ['dark', 'light', 'terminal']) {
    const svg = renderBadge(theme, 482);
    assert.match(svg, /^<svg[^>]+width="250" height="54"/);
    assert.match(svg, />482</);
    assert.doesNotMatch(svg, /<script|\son\w+=/i);
    assert.match(svg, /<image href="data:image\/png;base64,/);
  }
  assert.doesNotMatch(renderBadge('dark', 0), />0</);
  const ok = await call(makeBadgeHandler({ redis: async c => (assert.deepEqual(c, ['GET', `digivated:card:likes:project:${id}`]), '37') }), `/api/badge?id=${id}&theme=light`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['content-type'], 'image/svg+xml; charset=utf-8');
  assert.equal(ok.headers['cross-origin-resource-policy'], 'cross-origin');
  assert.match(ok.headers['content-security-policy'], /img-src data:/, 'the embedded logo must be allowed');
  assert.match(ok.headers['cache-control'], /max-age=300/);
  assert.match(ok.body, />37</);
  assert.match(ok.body, /fill="#ffffff"/);
  const down = await call(makeBadgeHandler({ redis: async () => { throw Error('offline'); } }), `/api/badge?id=${id}`);
  assert.equal(down.status, 200);
  assert.match(down.body, /↗/);
  assert.equal((await call(makeBadgeHandler({ redis: async () => '1' }), '/api/badge?id=../x')).status, 404);
  assert.equal((await call(makeBadgeHandler({ redis: async () => '1' }), `/api/badge?id=${id}`, 'POST')).status, 405);
});

test('the public router serves badges without adding a serverless function', async () => {
  const router = makePublicRouter(defaultPublicHandlers({ badge: makeBadgeHandler({ redis: async () => '5' }) }));
  for (const url of [`/api/badge?id=${id}&theme=terminal`, `/badge/${id}?theme=terminal`, `/badge/${id}.svg?theme=terminal`]) {
    const res = await call(router, url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers['content-type'], 'image/svg+xml; charset=utf-8', url);
    assert.match(res.body, /DIGIVATED/, url);
  }
  assert.equal((await call(router, '/badge/a/b')).status, 404);
});
