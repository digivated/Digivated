import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { projectDisplayLogo } from '../server/project-display-logo.mjs';
import legacyImages from '../server/project-logo-overrides.json' with { type: 'json' };

test('logo overrides apply only to the exact reviewed upload', () => {
  const record = { id: 'sample', image: 'data:image/png;base64,b2xk' };
  const reviewed = { length: record.image.length, sha256: createHash('sha256').update(record.image).digest('hex') };
  assert.equal(projectDisplayLogo(record, { sample: { ...reviewed, source: 'https://example.com/logo.png' } }), '/media/project-logos/sample.webp');
  assert.equal(projectDisplayLogo(record, { sample: reviewed }), '');
  assert.equal(projectDisplayLogo({ ...record, image: 'data:image/png;base64,bmV3' }, { sample: reviewed }), '/api/projects?image=sample');
  assert.equal(projectDisplayLogo(record, {}), '/api/projects?image=sample');
  assert.equal(projectDisplayLogo({ ...record, image: '' }, { sample: reviewed }), '');
});

test('every reviewed logo has a bundled WebP asset', () => {
  for (const [id, reviewed] of Object.entries(legacyImages)) {
    if (!reviewed.source) continue;
    const file = readFileSync(new URL(`../public/media/project-logos/${id}.webp`, import.meta.url));
    assert.equal(file.toString('utf8', 8, 12), 'WEBP', id);
  }
});
