import test from 'node:test';
import assert from 'node:assert/strict';
import { launchSchemaGraph, launchSchemaScript } from '../server/launch-schema.mjs';

const canonical = 'https://digivated.com/projects/fieldnotes-1';
const item = { name: 'Fieldnotes', category: 'Apps', website: 'https://example.com', publishedAt: '2026-04-02T12:00:00.000Z' };
const template = JSON.stringify({ '@graph': [
  { '@type': 'Organization', '@id': 'https://digivated.com/#organization', name: 'Digivated', sameAs: ['https://x.com/digivatedx'] },
  { '@type': 'WebSite', '@id': 'https://digivated.com/#website', name: 'Digivated' },
  { '@type': 'WebPage', '@id': 'https://digivated.com/launch-template#webpage' },
] });

test('graph keeps template Organization and WebSite and every @id reference resolves', () => {
  const graph = launchSchemaGraph({ item, canonical, description: 'A note app.', templateSchema: template })['@graph'];
  const ids = new Set(graph.map(node => node['@id']));
  assert.ok(ids.has('https://digivated.com/#organization') && ids.has('https://digivated.com/#website'));
  assert.equal(graph.find(node => node['@type'] === 'Organization').sameAs[0], 'https://x.com/digivatedx');
  assert.equal(graph.some(node => String(node['@id']).includes('launch-template')), false);
  const refs = JSON.stringify(graph).match(/"@id":"[^"]+"/g);
  for (const ref of new Set(refs)) assert.ok(ids.has(ref.slice(7, -1)), `unresolved ${ref}`);
});

test('breadcrumb, dates and project node are accurate and omit unknowns', () => {
  const graph = launchSchemaGraph({ item, canonical, description: 'd', templateSchema: template })['@graph'];
  assert.equal(graph.find(node => node['@type'] === 'WebPage').datePublished, '2026-04-02');
  assert.deepEqual(graph.find(node => node['@type'] === 'BreadcrumbList').itemListElement.map(entry => entry.position), [1, 2, 3]);
  const bare = launchSchemaGraph({ item: { name: 'X', website: 'javascript:alert(1)' }, canonical, description: 'd' })['@graph'];
  const project = bare.find(node => node['@type'] === 'CreativeWork');
  assert.equal(project.sameAs, undefined);
  assert.equal(project.datePublished, undefined);
  assert.equal(bare.filter(node => ['Organization', 'WebSite'].includes(node['@type'])).length, 2);
});

test('script output is valid JSON and cannot break out of the tag', () => {
  const html = launchSchemaScript({ item: { ...item, name: '</script><b>' }, canonical, description: 'd', templateSchema: '{bad json' });
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  const json = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
  assert.equal(JSON.parse(json)['@graph'].find(node => node['@type'] === 'WebPage').name, '</script><b>');
});
