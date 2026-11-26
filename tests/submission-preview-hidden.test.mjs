import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('an empty logo preview stays hidden when the preview uses display grid', () => {
  const css = readFileSync(new URL('../src/styles/submission-flow.css', import.meta.url), 'utf8');
  const grid = css.indexOf('html#digivated-root #project-form .submission-image-preview {');
  const hidden = css.indexOf('html#digivated-root #project-form #project-image-preview[hidden] { display: none !important; }');
  assert.ok(grid > 0);
  assert.ok(hidden > grid);
});
