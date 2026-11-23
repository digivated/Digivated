import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProjectIndex, groupProjects } from '../server/project-index-render.mjs';
import { makeProjectIndexHandler } from '../server/project-index.mjs';

const template = '<html><head><title>x</title><link rel="canonical" href="https://digivated.com/projects"/><meta name="description" content="d"/><meta property="og:url" content="u"/><script type="application/ld+json">{"@graph":[{"@type":"Organization","@id":"o"},{"@type":"WebPage","@id":"w"}]}</script></head><body><!--PROJECTS_BODY--></body></html>';
const projects = [
  { pageUrl: '/projects/a-1', name: 'Alpha <b>', creator: 'Ada', description: 'First app.', category: 'Apps', publishedAt: '2026-05-01' },
  { pageUrl: '/projects/listing/b-2', name: 'Beta', creator: 'Bo', description: 'Second app.', category: 'Apps', publishedAt: '2026-06-01' },
  { pageUrl: '/projects/c-3', name: 'Gamma', category: 'AI', description: 'x'.repeat(400) },
  { pageUrl: '/admin', name: 'Hidden', category: 'Apps' },
  { pageUrl: '/projects/d-4', category: 'Apps' },
];

test('groups by category, newest first, and drops non-project or unnamed entries', () => {
  const groups = groupProjects(projects);
  assert.deepEqual(groups.map(([name, list]) => [name, list.length]), [['Apps', 2], ['AI', 1]]);
  assert.equal(groups[0][1][0].name, 'Beta');
});

test('page has crawlable links, escaped text, truncated descriptions and matching metadata', () => {
  const html = renderProjectIndex(template, projects);
  assert.match(html, /<a href="\/projects\/listing\/b-2">Beta<\/a>/);
  assert.match(html, /Alpha &lt;b&gt;/);
  assert.doesNotMatch(html, /Hidden|\/admin/);
  assert.doesNotMatch(html, /x{200}/);
  assert.match(html, /<title>All projects · Digivated<\/title>/);
  assert.match(html, /Browse 3 independent products/);
  const ld = JSON.parse(html.match(/ld\+json">(.*?)<\/script>/)[1]);
  const page = ld['@graph'].find(node => node['@type'] === 'CollectionPage');
  assert.equal(page.mainEntity.numberOfItems, 3);
  assert.equal(page.mainEntity.itemListElement[0].url.startsWith('https://digivated.com/projects/'), true);
  assert.ok(ld['@graph'].some(node => node['@type'] === 'Organization'));
});

test('empty directory renders a clear page', () => {
  assert.match(renderProjectIndex(template, []), /No projects have been published yet/);
});

function run(handler, method = 'GET') {
  return new Promise(resolve => {
    const headers = {};
    const res = { statusCode: 0, setHeader: (k, v) => { headers[k] = v; }, end: body => resolve({ status: res.statusCode, headers, body }) };
    handler({ method, url: '/projects' }, res);
  });
}

test('handler serves 200 with short shared caching, 503 uncached on failure, 405 for writes', async () => {
  const ok = await run(makeProjectIndexHandler({ template, loadProjects: async () => projects }));
  assert.equal(ok.status, 200);
  assert.match(ok.headers['Cache-Control'], /s-maxage=300/);
  const bad = await run(makeProjectIndexHandler({ template, loadProjects: async () => { throw new Error('down'); } }));
  assert.equal(bad.status, 503);
  assert.equal(bad.headers['Cache-Control'], 'no-store');
  assert.equal((await run(makeProjectIndexHandler({ template, loadProjects: async () => projects }), 'POST')).status, 405);
  assert.equal((await run(makeProjectIndexHandler({ template, env: {} }))).status, 503);
});
