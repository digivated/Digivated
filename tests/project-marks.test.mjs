import assert from 'node:assert/strict';
import test from 'node:test';
import { projectMarks } from '../src/lib/project-marks.mjs';

test('a project keeps the same badge labels everywhere', () => {
  assert.deepEqual(projectMarks({ status: 'featured', sponsored: true, rising: 4 }), ['member', 'rising']);
  assert.deepEqual(projectMarks({ featured: true }), ['member']);
  assert.deepEqual(projectMarks({ status: 'approved', sponsored: true }), ['spot']);
  assert.deepEqual(projectMarks({ status: 'approved', fresh: true, rising: 9 }), ['fresh']);
  assert.deepEqual(projectMarks({ status: 'featured', rising: 2 }), ['member', 'rising']);
  assert.deepEqual(projectMarks(null), []);
});
