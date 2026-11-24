import test from 'node:test';
import assert from 'node:assert/strict';
import { forums, starterById, starters } from '../src/data/forums.mjs';
import { discussPath, launchFromToday, starterPath, storyFromToday } from '../src/lib/threads-ui.mjs';
import { newsArticleMarkup } from '../src/lib/news-story.mjs';

const now = Date.parse('2026-11-24T18:00:00');

test('topic forums keep their slugs and each has one icon', () => {
  assert.deepEqual(forums.map(forum => forum.slug), ['general', 'feedback', 'show', 'introductions', 'help']);
  assert.equal(new Set(forums.map(forum => forum.icon)).size, forums.length);
  for (const forum of forums) assert.equal(forum.description.includes('—'), false);
});

test('starter prompts are labeled and only open the composer', () => {
  assert.equal(starters.length, 3);
  assert.equal(starterById('nope'), null);
  assert.equal(starterPath('show-shipped'), '/threads/new?forum=show&starter=show-shipped');
  assert.match(starterById('intro-hello').detail, /Opens/);
});

test('today strip keeps only real items from today', () => {
  const story = { id: 'a'.repeat(24), headline: 'A real story', publishedAt: '2026-11-24T15:00:00' };
  const older = { id: 'b'.repeat(24), headline: 'Yesterday', publishedAt: '2026-11-23T15:00:00' };
  assert.equal(storyFromToday([older, story], now).headline, 'A real story');
  assert.equal(storyFromToday([older], now), null);
  assert.equal(storyFromToday([{ headline: 'Missing id', publishedAt: story.publishedAt }], now), null);
  const launch = { id: 'launch-1', name: 'Pocketlog', launchAt: '2026-11-24T13:00:00' };
  assert.equal(launchFromToday([launch, { name: 'Later', launchAt: '2026-11-25T13:00:00' }], now).name, 'Pocketlog');
  assert.equal(launchFromToday([{ name: 'Later', launchAt: '2026-11-25T13:00:00' }], now), null);
});

test('a news story links to its discussion without inventing a thread', () => {
  const id = 'c'.repeat(24);
  assert.equal(discussPath(id), `/threads/new?news=${id}`);
  assert.equal(discussPath('nope'), '');
  const html = newsArticleMarkup({ id, headline: 'A sourced story', summary: 'Short.', category: 'ai-tech', sourceName: 'Example', sourceUrl: 'https://example.com/story', sourcePublishedAt: '2026-11-24T12:00:00.000Z', publishedAt: '2026-11-24T12:00:00.000Z' });
  assert.match(html, new RegExp(`href="/threads/new\\?news=${id}"`));
  assert.match(html, />Discuss</);
  assert.equal(html.includes('—'), false);
});
