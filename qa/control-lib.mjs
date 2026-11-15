export async function setQaMode({ mode, repo, token, fetcher = fetch, apiRoot = 'https://api.github.com' }) {
  if (!['STOP', 'PAUSE', 'RESUME'].includes(mode)) throw new Error('Expected STOP, PAUSE, or RESUME.');
  if (!/^[^/]+\/[^/]+$/.test(repo || '') || !token) throw new Error('A repository and workflow token are required.');
  const base = `${apiRoot}/repos/${repo}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28' };
  async function api(path, method = 'GET', body) {
    const response = await fetcher(base + path, { method, headers: {
      ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    // A run can finish between listing it and canceling it.
    if (method === 'POST' && path.endsWith('/cancel') && response.status === 409) return null;
    if (!response.ok) throw new Error(`QA control rejected ${method} ${path}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  const workflow = '/actions/workflows/qa-monitor.yml';
  if (mode === 'RESUME') {
    // Workflow state is the gate: GITHUB_TOKEN has actions:write, but cannot
    // edit repository variables. Keep this control independent of those settings.
    await api(`${workflow}/enable`, 'PUT');
    const state = await api(workflow);
    if (state.state !== 'active') throw new Error('Monitor did not become active.');
    return { mode: 'ACTIVE', canceled: 0 };
  }
  // Disable new events first, then cancel runs already in progress or queued.
  await api(`${workflow}/disable`, 'PUT');
  let canceled = 0;
  for (const status of ['in_progress', 'queued']) {
    // Collect every page before cancellation changes the result list.
    const ids = [];
    for (let page = 1; ; page++) {
      const runs = await api(`${workflow}/runs?status=${status}&per_page=100&page=${page}`);
      ids.push(...(runs.workflow_runs || []).map(run => run.id));
      if ((runs.workflow_runs || []).length < 100) break;
    }
    for (const id of ids) {
      await api(`/actions/runs/${id}/cancel`, 'POST');
      canceled++;
    }
  }
  const state = await api(workflow);
  if (state.state === 'active') throw new Error('Monitor is still active.');
  return { mode, canceled };
}
