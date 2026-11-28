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
  assert.match(projectDisplayLogo({ ...record, image: 'data:image/png;base64,bmV3' }, { sample: reviewed }), /^\/api\/projects\?image=sample&v=[a-f0-9]{12}$/);
  assert.match(projectDisplayLogo(record, {}), /^\/api\/projects\?image=sample&v=[a-f0-9]{12}$/);
  assert.equal(projectDisplayLogo({ ...record, image: '' }, { sample: reviewed }), '');
});

test('every reviewed logo has a safe bundled asset in its original format', () => {
  for (const [id, reviewed] of Object.entries(legacyImages)) {
    if (!reviewed.source) continue;
    const name = reviewed.file || `${id}.webp`;
    const file = readFileSync(new URL(`../public/media/project-logos/${name}`, import.meta.url));
    if (reviewed.file) {
      assert.match(name, new RegExp(`^${id}\\.[a-f0-9]{12}\\.(png|svg|webp|ico)$`));
      assert.equal(name.split('.')[1], createHash('sha256').update(file).digest('hex').slice(0, 12));
    }
    if (name.endsWith('.svg')) {
      const svg = file.toString('utf8');
      assert.match(svg, /<svg\b/);
      assert.doesNotMatch(svg, /<(?:script|foreignObject|iframe|image)\b|\bon\w+\s*=|<!DOCTYPE|<!ENTITY|(?:href|src)\s*=\s*["'](?:https?:|\/\/|data:)|@import/i);
    } else if (name.endsWith('.png')) assert.equal(file.toString('ascii', 1, 4), 'PNG');
    else if (name.endsWith('.ico')) assert.deepEqual([...file.subarray(0, 4)], [0, 0, 1, 0]);
    else assert.equal(file.toString('utf8', 8, 12), 'WEBP', id);
  }
});

test('logo cache version follows the image, not unrelated listing edits', () => {
 const record = {id:'stable', image:'data:image/png;base64,b2xk'};
 const original = projectDisplayLogo(record, {});
 assert.equal(projectDisplayLogo({...record, name:'Renamed', revision:9}, {}), original);
 assert.notEqual(projectDisplayLogo({...record, image:'data:image/png;base64,bmV3'}, {}), original);
});

test('reviewed native-format icons preserve the future-upload safeguard', () => {
  const record = { id: 'sample', image: 'data:image/png;base64,b2xk' };
  const reviewed = { length: record.image.length, sha256: createHash('sha256').update(record.image).digest('hex'), source: 'https://example.com/icon.svg', file: 'sample.012345abcdef.svg' };
  assert.equal(projectDisplayLogo(record, { sample: reviewed }), '/media/project-logos/sample.012345abcdef.svg');
  assert.match(projectDisplayLogo({ ...record, image: 'changed' }, { sample: reviewed }), /^\/api\/projects\?image=sample&v=/);
  assert.match(projectDisplayLogo(record, { sample: { ...reviewed, file: '../other.svg' } }), /^\/api\/projects\?image=sample&v=/);
});
