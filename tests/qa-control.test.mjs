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

test('STOP disables and cancels runs before setting the gate', async () => {
  const { calls, fetcher } = fixture();
  const result = await setQaMode({ mode: 'STOP', repo: 'digivated/Digivated', token: 'test', fetcher });
  assert.equal(result.mode, 'STOP');
  assert.equal(calls[0][0], 'PUT');
  assert.match(calls[0][1], /qa-monitor\.yml\/disable$/);
  assert(calls.some(([method, path]) => method === 'POST' && /\/runs\/123\/cancel$/.test(path)));
  assert(calls.some(([method, path]) => method === 'PATCH' && /DIGIVATED_QA_MODE$/.test(path)));
});

test('RESUME sets the gate before enabling the monitor', async () => {
  const { calls, fetcher } = fixture();
  const result = await setQaMode({ mode: 'RESUME', repo: 'digivated/Digivated', token: 'test', fetcher });
  assert.equal(result.mode, 'ACTIVE');
  assert.equal(calls[0][0], 'PATCH');
  assert.equal(calls[1][0], 'PUT');
  assert.match(calls[1][1], /qa-monitor\.yml\/enable$/);
});
