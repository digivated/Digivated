import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterProjects, sortProjects, sectionLabel, categoryCounts, sortKeys } from '../src/lib/directory-sort.mjs';
import { boostProgress } from '../src/lib/feedback-score.mjs';

const p = (id, extra = {}) => ({ id, name: id, category: 'Apps', votes: { all: 0, weekly: 0 }, comments: 0, publishedAt: '2026-10-01T00:00:00Z', ...extra });
const projects = [
  p('beta', { votes: { all: 9, weekly: 1 }, comments: 2, publishedAt: '2026-11-10T00:00:00Z', status: 'featured', creator: 'Ada' }),
  p('alpha', { votes: { all: 3, weekly: 3 }, comments: 7, category: 'Design', rising: 4 }),
  p('gamma', { votes: { all: 9, weekly: 0 }, comments: 0, publishedAt: '2026-11-12T00:00:00Z', description: 'Invoice helper' }),
  p('delta', { votes: null, comments: 0, fresh: true, publishedAt: '2026-11-17T00:00:00Z' }),
];
const ids = list => list.map(item => item.id);

test('every sort orders the whole catalogue without dropping projects', () => {
  for (const key of sortKeys) assert.equal(sortProjects(projects, key).length, projects.length, key);
  assert.deepEqual(ids(sortProjects(projects, 'top')), ['beta', 'gamma', 'alpha', 'delta']);
  assert.deepEqual(ids(sortProjects(projects, 'new')), ['delta', 'gamma', 'beta', 'alpha']);
  assert.deepEqual(ids(sortProjects(projects, 'discussed')), ['alpha', 'beta', 'gamma', 'delta']);
  assert.deepEqual(ids(sortProjects(projects, 'needs')), ['delta', 'gamma', 'beta', 'alpha']);
  assert.deepEqual(ids(sortProjects(projects, 'rising')), ['alpha', 'beta', 'delta', 'gamma']);
  assert.deepEqual(ids(sortProjects(projects, 'az')), ['alpha', 'beta', 'delta', 'gamma']);
  assert.deepEqual(ids(sortProjects(projects, 'unknown')), ids(sortProjects(projects, 'top')));
  assert.deepEqual(ids(projects), ['beta', 'alpha', 'gamma', 'delta'], 'input is not mutated');
});

test('search, category and featured filters combine', () => {
  assert.deepEqual(ids(filterProjects(projects, { query: 'ada' })), ['beta']);
  assert.deepEqual(ids(filterProjects(projects, { query: 'invoice  helper' })), ['gamma']);
  assert.deepEqual(ids(filterProjects(projects, { category: 'Design' })), ['alpha']);
  assert.deepEqual(ids(filterProjects(projects, { featured: true })), ['beta']);
  assert.deepEqual(ids(filterProjects(projects, { featured: true, category: 'Design' })), []);
  assert.equal(filterProjects(projects, {}).length, 4);
});

test('dividers and category counts', () => {
  assert.equal(sectionLabel(projects[0], 'new'), 'Nov 2026');
  assert.equal(sectionLabel({ name: '9lives' }, 'az'), '#');
  assert.equal(sectionLabel({ name: 'zeta' }, 'az'), 'Z');
  assert.equal(sectionLabel(projects[0], 'top'), '');
  assert.deepEqual(categoryCounts(projects), [['Apps', 3], ['Design', 1]]);
});

test('bonus upvote progress', () => {
  assert.deepEqual(boostProgress(0), { boosts: 0, into: 0, toNext: 10, bar: '[□□□□□□□□□□]' });
  assert.deepEqual(boostProgress(23), { boosts: 2, into: 3, toNext: 7, bar: '[■■■□□□□□□□]' });
  assert.equal(boostProgress(-5).boosts, 0);
  assert.equal(boostProgress('x').into, 0);
});
