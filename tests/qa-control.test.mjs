import test from 'node:test';
import assert from 'node:assert/strict';
import { setQaMode } from '../qa/control-lib.mjs';

function fixture() {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push([options.method, new URL(url).pathname]);
    const pathname = new URL(url).pathname;
    const body = pathname.endsWith('/runs') ? { workflow_runs: [{ id: 123 }] }
      : pathname.endsWith('/qa-monitor.yml') ? { state: calls.some(([method, path]) => method === 'PUT' && path.endsWith('/enable')) ? 'active' : 'disabled_manually' }
      : {};
    return { ok: true, status: options.method === 'GET' ? 200 : 204, json: async () => body };
  };
  return { calls, fetcher };
}

test('STOP disables and cancels runs without repository-variable permission', async () => {
  const { calls, fetcher } = fixture();
  const result = await setQaMode({ mode: 'STOP', repo: 'digivated/Digivated', token: 'test', fetcher });
  assert.equal(result.mode, 'STOP');
  assert.equal(calls[0][0], 'PUT');
  assert.match(calls[0][1], /qa-monitor\.yml\/disable$/);
  assert(calls.some(([method, path]) => method === 'POST' && /\/runs\/123\/cancel$/.test(path)));
  assert(!calls.some(([, path]) => path.includes('/variables')));
});

test('RESUME enables and verifies the workflow without repository-variable permission', async () => {
  const { calls, fetcher } = fixture();
  const result = await setQaMode({ mode: 'RESUME', repo: 'digivated/Digivated', token: 'test', fetcher });
  assert.equal(result.mode, 'ACTIVE');
  assert.equal(calls[0][0], 'PUT');
  assert.match(calls[0][1], /qa-monitor\.yml\/enable$/);
  assert(!calls.some(([, path]) => path.includes('/variables')));
});

for (const mode of ['STOP', 'RESUME']) test(`${mode} fails visibly if GitHub rejects the switch`, async () => {
  await assert.rejects(setQaMode({ mode, repo: 'digivated/Digivated', token: 'test',
    fetcher: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});

test('PAUSE cancels every page and tolerates a run finishing during cancellation', async () => {
  const canceled = [];
  const fetcher = async (url, options) => {
    const parsed = new URL(url);
    let body = { state: 'disabled_manually' };
    if (parsed.pathname.endsWith('/runs')) {
      const page = Number(parsed.searchParams.get('page'));
      body = { workflow_runs: parsed.searchParams.get('status') === 'queued'
        ? [] : page === 1 ? Array.from({ length: 100 }, (_, id) => ({ id })) : [{ id: 100 }] };
    }
    if (parsed.pathname.endsWith('/cancel')) {
      canceled.push(Number(parsed.pathname.split('/').at(-2)));
      if (canceled.at(-1) === 100) return { ok: false, status: 409 };
    }
    return { ok: true, status: options.method === 'GET' ? 200 : 204, json: async () => body };
  };
  const result = await setQaMode({ mode: 'PAUSE', repo: 'digivated/Digivated', token: 'test', fetcher });
  assert.equal(result.mode, 'PAUSE');
  assert.equal(canceled.length, 101);
  assert.equal(new Set(canceled).size, 101);
});
