import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('../public/analytics.js', import.meta.url), 'utf8');

function load(hostname) {
  const calls = [];
  const listeners = new Map();
  const head = { appendChild: node => { head.tag = node; } };
  const document = {
    referrer: 'https://search.example/results?q=private',
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    addEventListener: (type, callback) => listeners.set(type, callback),
    head,
  };
  const window = {
    location: { hostname, href: `https://${hostname}/news?q=private#story` },
    gtag: (...args) => calls.push(args),
  };
  runInNewContext(source, { window, document, URL, Date, Element: class {} });
  return { window, calls, listeners, head };
}

test('analytics runs only on the production hostname and removes query data', () => {
  const preview = load('preview.digivated.com');
  assert.equal(preview.calls.length, 0);
  assert.equal(preview.head.tag, undefined);
  const prod = load('digivated.com');
  assert.equal(prod.calls[1][2].page_location, 'https://digivated.com/news');
  assert.equal(prod.calls[1][2].page_referrer, 'https://search.example/results');
  assert.equal(prod.head.tag.async, true);
});

test('product events discard private and unknown details', () => {
  const { window, calls } = load('digivated.com');
  window.digivatedTrack('membership_checkout', { email: 'private@example.com' });
  window.digivatedTrack('news_category_select', { news_category: 'markets', search_term: 'private' });
  window.digivatedTrack('project_open', { project_category: 'AI & Tech', project_id: 'private' });
  window.digivatedTrack('unknown', { email: 'private@example.com' });
  assert.deepEqual(calls.slice(2).map(call => JSON.parse(JSON.stringify([call[1], call[2]]))), [
    ['membership_checkout', {}],
    ['news_category_select', { news_category: 'markets' }],
    ['project_open', { project_category: 'AI & Tech' }],
  ]);
});
