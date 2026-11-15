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
    if (!response.ok) throw new Error(`QA control rejected ${method} ${path}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  async function setVariable(value) {
    const path = '/actions/variables/DIGIVATED_QA_MODE';
    const body = { name: 'DIGIVATED_QA_MODE', value };
    const response = await fetcher(base + path, { method: 'PATCH', headers: {
      ...headers, 'Content-Type': 'application/json',
    }, body: JSON.stringify(body) });
    if (response.status === 404) return api('/actions/variables', 'POST', body);
    if (!response.ok) throw new Error(`QA control could not set its repository gate: HTTP ${response.status}`);
  }
  const workflow = '/actions/workflows/qa-monitor.yml';
  if (mode === 'RESUME') {
    // Enable only after the mode is active; a failed call leaves the monitor off.
    await setVariable('ACTIVE');
    await api(`${workflow}/enable`, 'PUT');
    const state = await api(workflow);
    if (state.state !== 'active') throw new Error('Monitor did not become active.');
    return { mode: 'ACTIVE', canceled: 0 };
  }
  // Disable the schedule first. Cancel any run already in progress, then set
  // the repository gate so even an already queued event cannot start a job.
  await api(`${workflow}/disable`, 'PUT');
  let canceled = 0;
  for (const status of ['in_progress', 'queued']) {
    const runs = await api(`${workflow}/runs?status=${status}&per_page=100`);
    for (const run of runs.workflow_runs || []) {
      await api(`/actions/runs/${run.id}/cancel`, 'POST');
      canceled++;
    }
  }
  await setVariable(mode);
  const state = await api(workflow);
  if (state.state === 'active') throw new Error('Monitor is still active.');
  return { mode, canceled };
}
