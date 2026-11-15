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
  const gate = '/contents/qa/mode.json';
  const value = mode === 'RESUME' ? 'ACTIVE' : mode;
  const previous = await api(`${gate}?ref=main`);
  await api(gate, 'PUT', {
    message: `QA monitor: ${value}`,
    content: Buffer.from(JSON.stringify({ mode: value }) + '\n').toString('base64'),
    sha: previous.sha, branch: 'main',
  });
  const saved = await api(`${gate}?ref=main`);
  if (JSON.parse(Buffer.from(saved.content, 'base64').toString()).mode !== value) {
    throw new Error('QA mode did not persist.');
  }
  if (mode === 'RESUME') {
    const state = await api(workflow);
    if (state.state !== 'active') throw new Error('Enable the QA monitor workflow in GitHub before resuming.');
    return { mode: 'ACTIVE', canceled: 0 };
  }
  // Persist the stop gate before canceling runs already in progress or queued.
  let canceled = 0;
  for (const status of ['in_progress', 'queued']) {
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
  return { mode, canceled };
}
