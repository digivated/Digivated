import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPublic } from '../server/admin-store.mjs';
import { makePublicHandler } from '../server/public-community.mjs';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFJkAAAAASUVORK5CYII=';
const record = (id, extras = {}) => ({ id, name: id, creator: 'Builder', status: 'approved', consent: true, url: 'https://example.com', image, ...extras });

function fixture(records) {
  const ids = records.map(item => item.id);
  const data = new Map(records.map(item => [`digivated:submission:${item.id}`, JSON.stringify(item)]));
  records.forEach(item => data.set(`digivated:public:submission:${item.id}`, '{}'));
  const redis = async ([command, ...args]) => {
    if (command === 'ZCARD') return ids.length;
    if (command === 'ZREVRANGE') return ids.slice(Number(args[1]), Number(args[2]) + 1);
    if (command === 'MGET') return args.map(key => data.get(key) || null);
    if (command === 'GET') return data.get(args[0]) || null;
    throw Error(`Unexpected ${command}`);
  };
  const handler = makePublicHandler('projects', { redis });
  const read = async url => {
    let body;
    const res = { statusCode: 200, setHeader() {}, end(data) { body = JSON.parse(data); } };
    await handler({ method: 'GET', url }, res);
    return { status: res.statusCode, ...body };
  };
  return read;
}

test('public projects need an image and a usable destination', () => {
  assert.equal(projectPublic(record('missing-image', { image: '' })), null);
  assert.equal(projectPublic(record('broken-link', { url: 'javascript:alert(1)' })), null);
  assert.equal(projectPublic(record('empty-link', { url: '' })), null);
  assert.equal(projectPublic(record('valid')).image, '/api/projects?image=valid');
});

test('filtered raw pages still expose later projects and featured entries', async () => {
  const records = Array.from({ length: 100 }, (_, index) => record(`empty-${index}`, { image: '' }));
  records.push(record('visible', { status: 'featured' }));
  const read = fixture(records);
  assert.deepEqual((await read('/api/projects')).items, []);
  assert.equal((await read('/api/projects')).next, 100);
  assert.deepEqual((await read('/api/projects?offset=100')).items.map(item => item.id), ['visible']);
  assert.equal((await read('/api/projects?offset=100')).next, null);
  assert.deepEqual((await read('/api/projects?view=featured')).items.map(item => item.id), ['visible']);
  assert.equal((await read('/api/projects?id=empty-0')).status, 404);
  assert.equal((await read('/api/projects?image=empty-0')).status, 404);
});
