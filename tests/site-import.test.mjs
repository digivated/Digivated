import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteExtras, readPublicImage } from '../server/project-site.mjs';
import { guessCategory } from '../src/lib/project-taxonomy.mjs';

test('website import finds a clean name, the X handle and icon candidates', () => {
  const html = '<title>Indie Project Directory &amp; Weekly Launches · Digivated</title><meta name="twitter:site" content="@digivatedx"><link rel="icon" href="/fav.svg" type="image/svg+xml"><link rel="apple-touch-icon" sizes="180x180" href="https://cdn.example.com/touch.png"><link rel="icon" href="http://insecure.test/x.png">';
  const extra = siteExtras(html, 'https://www.digivated.com/');
  assert.equal(extra.name, 'Digivated');
  assert.equal(extra.social, '@digivatedx on X');
  assert.deepEqual(extra.icons.slice(0, 2), ['https://cdn.example.com/touch.png', 'https://www.digivated.com/fav.svg']);
  assert.ok(extra.icons.every(href => href.startsWith('https://')));
  assert.equal(siteExtras('<meta property="og:site_name" content="Acme">', 'https://acme.dev').name, 'Acme');
  assert.equal(siteExtras('<meta name="twitter:site" content="@not a handle">', 'https://acme.dev').social, '');
  assert.deepEqual(siteExtras('', 'not a url'), { name: '', social: '', icons: [] });
});

test('icon fetching refuses private addresses and non-HTTPS URLs', async () => {
  await assert.rejects(readPublicImage('http://example.com/a.png'), /not allowed/);
  await assert.rejects(readPublicImage('https://127.0.0.1/a.png'), /not allowed/);
  await assert.rejects(readPublicImage('https://internal.test/a.png', { resolve: async () => [{ address: '10.0.0.5' }] }), /not allowed/);
});

test('icon fetching returns base64 image data and rejects non-images', async () => {
  const resolve = async () => [{ address: '93.184.216.34' }];
  const reply = (status, type, body) => (_url, _options, onResponse) => {
    const handlers = {};
    const res = { statusCode: status, headers: { 'content-type': type }, resume() {}, on(event, fn) { handlers[event] = fn; } };
    return { on() {}, destroy() {}, end() { onResponse(res); handlers.data?.(Buffer.from(body)); handlers.end?.(); } };
  };
  assert.deepEqual(await readPublicImage('https://cdn.test/i.png', { resolve, transport: reply(200, 'image/png', 'PNG') }), { type: 'image/png', data: Buffer.from('PNG').toString('base64') });
  await assert.rejects(readPublicImage('https://cdn.test/i.png', { resolve, transport: reply(200, 'text/html', '<html>') }), /Not an image/);
});

test('category guesses use the site topics and stay empty when unsure', () => {
  assert.equal(guessCategory('Track your workouts and sleep'), 'Health & Fitness');
  assert.equal(guessCategory('Zzzz qqq'), '');
});
