import test from 'node:test';
import assert from 'node:assert/strict';
import { setQaMode } from '../qa/control-lib.mjs';

function fixture({ many = false, rejectWrite = false } = {}) {
  const calls = [];
  let mode = 'STOP';
  const fetcher = async (url, options) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    calls.push([options.method, path]);
    let body = {};
    if (path.endsWith('/contents/qa/mode.json')) {
      if (options.method === 'PUT') {
        if (rejectWrite) return { ok: false, status: 403 };
        const input = JSON.parse(options.body);
        assert.equal(input.branch, 'main');
        assert.equal(input.sha, 'previous');
        mode = JSON.parse(Buffer.from(input.content, 'base64').toString()).mode;
      }
      body = { sha: 'previous', content: Buffer.from(JSON.stringify({ mode })).toString('base64') };
    } else if (path.endsWith('/runs')) {
      const page = Number(parsed.searchParams.get('page'));
      body = { workflow_runs: parsed.searchParams.get('status') === 'queued' ? []
        : many && page === 1 ? Array.from({ length: 100 }, (_, id) => ({ id })) : [{ id: 100 }] };
    } else if (path.endsWith('/qa-monitor.yml')) body = { state: 'active' };
    if (path.endsWith('/100/cancel')) return { ok: false, status: 409 };
    return { ok: true, status: options.method === 'GET' ? 200 : 204, json: async () => body };
  };
  return { calls, fetcher, mode: () => mode };
}

for (const mode of ['STOP', 'PAUSE']) test(`${mode} persists the gate before canceling checks`, async () => {
  const f = fixture();
  const result = await setQaMode({ mode, repo: 'digivated/Digivated', token: 'test', fetcher: f.fetcher });
  assert.equal(result.mode, mode);
  assert.equal(f.mode(), mode);
  const write = f.calls.findIndex(([method, path]) => method === 'PUT' && path.endsWith('/mode.json'));
  const cancel = f.calls.findIndex(([, path]) => path.endsWith('/cancel'));
  assert(write >= 0 && cancel > write);
  assert(!f.calls.some(([, path]) => /variables|enable|disable/.test(path)));
});

test('RESUME persists and verifies ACTIVE without administrative APIs', async () => {
  const f = fixture();
  const result = await setQaMode({ mode: 'RESUME', repo: 'digivated/Digivated', token: 'test', fetcher: f.fetcher });
  assert.equal(result.mode, 'ACTIVE');
  assert.equal(f.mode(), 'ACTIVE');
  assert(!f.calls.some(([, path]) => /variables|enable|disable|cancel/.test(path)));
});

test('rejected gate writes fail visibly and do not cancel runs or activate monitoring', async () => {
  const f = fixture({ rejectWrite: true });
  await assert.rejects(setQaMode({ mode: 'RESUME', repo: 'digivated/Digivated', token: 'test', fetcher: f.fetcher }), /HTTP 403/);
  assert.equal(f.mode(), 'STOP');
});

test('STOP handles all pages and a run finishing during cancellation', async () => {
  const f = fixture({ many: true });
  const result = await setQaMode({ mode: 'STOP', repo: 'digivated/Digivated', token: 'test', fetcher: f.fetcher });
  assert.equal(result.canceled, 101);
  assert.equal(f.calls.filter(([, path]) => path.endsWith('/cancel')).length, 101);
});
