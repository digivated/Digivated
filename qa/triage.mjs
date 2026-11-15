import { readFile } from 'node:fs/promises';

const reportPath = process.argv[2] || 'test-results/qa-report.json';
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const failures = [];

function visit(suite, parents = []) {
  const path = [...parents, suite.title].filter(Boolean);
  for (const spec of suite.specs || []) {
    for (const entry of spec.tests || []) {
      const results = entry.results || [];
      // A single failure followed by a pass is unreproduced, not an issue.
      if (results.length < 2 || results.at(-1)?.status === 'passed') continue;
      failures.push({ title: [...path, spec.title].join(' › '),
        message: String(results.at(-1)?.errors?.[0]?.message || '') });
    }
  }
  for (const child of suite.suites || []) visit(child, path);
}
for (const suite of report.suites || []) visit(suite);

const grouped = new Map();
for (const failure of failures) {
  const route = failure.title.replace(/^monitor\.spec\.ts › /, '').replace(/^(mobile|desktop) › /, '')
    .replace(/ renders without regressions$/, '');
  const visual = /snapshot|screenshot|different pixels/i.test(failure.message);
  const severity = visual ? 'P2' : route === 'home' ? 'P0'
    : /^(discover|rankings|news|creators|submit-project|membership|login|account|creator)$/.test(route) ? 'P1' : 'P2';
  const key = `${route}:${visual ? 'visual' : 'functional'}`;
  const current = grouped.get(key) || { route, severity, kind: visual ? 'visual change' : 'page failure', viewports: [] };
  current.viewports.push(failure.title.includes('mobile') ? 'mobile' : 'desktop');
  grouped.set(key, current);
}
const priority = { P0: 0, P1: 1, P2: 2 };
const confirmed = [...grouped.values()].sort((a, b) => priority[a.severity] - priority[b.severity]);
console.log(`QA: ${confirmed.length} unique confirmed failure(s) after a clean-browser retry.`);
if (!confirmed.length || process.env.QA_ISSUES_ENABLED !== 'true') process.exit(confirmed.length ? 1 : 0);

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
if (!token || !/^[^/]+\/[^/]+$/.test(repo || '')) throw new Error('GitHub issue reporting needs a workflow token and repository.');
const endpoint = `https://api.github.com/repos/${repo}`;
async function api(path, init = {}) {
  const response = await fetch(endpoint + path, { ...init, headers: {
    Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}),
  } });
  if (!response.ok) throw new Error(`GitHub issue reporting failed: ${response.status}`);
  return response.json();
}
const history = await api('/issues?state=all&per_page=100');
for (const item of confirmed.slice(0, 10)) {
  const title = `[QA ${item.severity}] ${item.route}: ${item.kind}`;
  const prior = history.find(issue => !issue.pull_request &&
    /^\[QA P[012]\] /.test(issue.title) && issue.title.replace(/^\[QA P[012]\] /, '') ===
      title.replace(/^\[QA P[012]\] /, ''));
  if (prior?.state === 'open') continue;
  const run = process.env.GITHUB_RUN_ID
    ? `https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'See the QA workflow run.';
  if (prior) {
    await api(`/issues/${prior.number}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'open', title: `[QA P1] ${item.route}: ${item.kind}` }) });
    await api(`/issues/${prior.number}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: `Regression confirmed twice. Escalated to P1. Evidence: ${run}. Add a regression test before fixing.` }) });
    continue;
  }
  await api('/issues', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body: `Detected twice in isolated browser runs.\n\nAffected page: ${item.route === 'home' ? '/' : '/' + item.route.replaceAll('_', '/')}\nViewports: ${[...new Set(item.viewports)].join(', ')}\nEvidence: ${run}\n\nReproduce with the read-only QA monitor. Confirm the root cause before changing code.`,
      labels: ['bug'] }),
  });
}
// Keep the workflow red until a human or later verified fix resolves the failure.
process.exit(1);
