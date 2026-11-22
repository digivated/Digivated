import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareLinks } from '../src/lib/share-links.mjs';

test('share links cover each platform, encode safely and never pass data: images to Pinterest', () => {
  const links = shareLinks({ url: 'https://digivated.com/projects/pocket-1', title: 'Pocket & Co on Digivated', text: 'Pocket & Co: "calm" notes', image: 'data:image/png;base64,AAAA' });
  assert.deepEqual(links.map(link => link.key), ['x', 'pinterest', 'linkedin', 'facebook', 'reddit', 'threads', 'bluesky', 'email']);
  for (const link of links) assert.ok(!/[ "<>]/.test(link.href), link.key);
  const pin = new URL(links.find(link => link.key === 'pinterest').href);
  assert.equal(pin.searchParams.get('media'), 'https://digivated.com/digivated-social-card.png');
  assert.equal(new URL(links[0].href).searchParams.get('url'), 'https://digivated.com/projects/pocket-1');
  assert.equal(new URL(shareLinks({ url: 'https://digivated.com/p', image: '/shot.png' })[1].href).searchParams.get('media'), 'https://digivated.com/shot.png');
  assert.deepEqual(shareLinks({ url: 'javascript:alert(1)' }), []);
  assert.deepEqual(shareLinks({ url: 'not a url' }), []);
});
