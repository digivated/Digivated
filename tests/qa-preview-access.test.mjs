import test from 'node:test';
import assert from 'node:assert/strict';
import { qaTarget, previewHeaders } from '../qa/preview-access.mjs';
const preview = 'https://digivated-git-fix-qa-preview-access-digivated.vercel.app';
test('QA accepts only production and this account project preview origins', () => {
  assert.equal(qaTarget().preview, false);
  assert.equal(qaTarget(preview).preview, true);
  for (const value of ['http://digivated.com', 'https://other.vercel.app',
    'https://digivated.com.evil.test', `${preview}/api`, `${preview}?token=bad`,
    `https://user:password@${new URL(preview).hostname}`, 'https://digivated.com:8443']) {
    assert.throws(() => qaTarget(value));
  }
});
test('bypass is added only to the selected protected-preview origin', () => {
  assert.equal(previewHeaders(`${preview}/api/projects`, preview, 'test')['x-vercel-protection-bypass'], 'test');
  for (const url of ['https://digivated.com', 'https://public-files.gumroad.com/image.png', 'https://other.vercel.app']) {
    assert.equal(previewHeaders(url, preview, 'test', { 'x-vercel-protection-bypass': 'old' })['x-vercel-protection-bypass'], undefined);
  }
  assert.equal(previewHeaders('https://digivated.com/api/projects', 'https://digivated.com', 'test')['x-vercel-protection-bypass'], undefined);
});
