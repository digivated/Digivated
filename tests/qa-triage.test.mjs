import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(results) {
  const dir = mkdtempSync(join(tmpdir(), 'digivated-qa-'));
  const report = join(dir, 'report.json');
  writeFileSync(report, JSON.stringify({ suites: [{ title: 'mobile', specs: [{ title: 'home renders without regressions', tests: [{ results }] }] }] }));
  const output = spawnSync(process.execPath, ['qa/triage.mjs', report], {
    cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', env: { ...process.env, QA_ISSUES_ENABLED: 'false' },
  });
  rmSync(dir, { recursive: true, force: true });
  return output;
}

test('a first failure followed by a pass stays unreproduced', () => {
  const output = run([{ status: 'failed' }, { status: 'passed' }]);
  assert.equal(output.status, 0);
  assert.match(output.stdout, /0 unique confirmed/);
});

test('two isolated failures are confirmed before issue reporting', () => {
  const output = run([{ status: 'failed' }, { status: 'failed' }]);
  assert.equal(output.status, 1);
  assert.match(output.stdout, /1 unique confirmed/);
});
