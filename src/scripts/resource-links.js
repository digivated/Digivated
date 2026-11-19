// Resources directory: category browsing, search, sorting and upvotes.
const root = document.querySelector('[data-link-directory]');
if (root) {
  const $ = selector => root.querySelector(selector);
  const search = $('[data-link-search]'), select = $('[data-link-select]'), status = $('[data-link-status]'), empty = $('[data-link-empty]');
  const groups = [...root.querySelectorAll('[data-link-group]')], buttons = [...root.querySelectorAll('[data-link-category]')];
  const sorts = [...root.querySelectorAll('[data-rl-sort]')];
  const items = [...root.querySelectorAll('[data-link-item]')];
  const byId = new Map(items.map(item => [item.dataset.id, item]));
  const valid = new Set(groups.map(group => group.dataset.linkGroup));
  const nice = new Intl.NumberFormat('en-US');
  const params = new URL(location.href).searchParams;
  let active = valid.has(params.get('category')) ? params.get('category') : groups[0].dataset.linkGroup;
  let sort = params.get('sort') === 'az' ? 'az' : 'top';
  let counts = {};
  let timer;

  // Votes this browser has cast (the server keeps the real one-per-visitor rule).
  const MINE = 'digivated-link-votes';
  const mine = new Set((() => { try { return JSON.parse(localStorage.getItem(MINE) || '[]'); } catch { return []; } })());
  const saveMine = () => { try { localStorage.setItem(MINE, JSON.stringify([...mine].slice(-500))); } catch {} };

  // Site icons: show the real logo when it loads; keep the monogram if it's missing or blank.
  const settleIcon = img => {
    const tile = img.closest('.rl-mono');
    if (img.naturalWidth >= 8) tile?.classList.add('has-icon');
    else { tile?.classList.remove('has-icon'); img.remove(); }
  };
  root.addEventListener('load', event => { if (event.target instanceof HTMLImageElement && event.target.matches('.rl-icon')) settleIcon(event.target); }, true);
  root.addEventListener('error', event => { if (event.target instanceof HTMLImageElement && event.target.matches('.rl-icon')) settleIcon(event.target); }, true);
  for (const img of root.querySelectorAll('.rl-icon')) if (img.complete) settleIcon(img);

  const count = id => counts[id] || 0;
  function paintVote(item) {
    const id = item.dataset.id, button = item.querySelector('[data-vote]');
    button.setAttribute('aria-pressed', mine.has(id) ? 'true' : 'false');
    // Zero stays blank so a fresh list reads clean.
    button.querySelector('[data-vote-count]').textContent = count(id) ? nice.format(count(id)) : '';
  }

  function order(list) {
    const ul = list.querySelector('.rl-grid');
    const sorted = [...ul.children].sort((a, b) => sort === 'az'
      ? a.dataset.name.localeCompare(b.dataset.name)
      : (count(b.dataset.id) - count(a.dataset.id)) || (a.dataset.order - b.dataset.order));
    // Only touch the DOM when the order actually changed.
    if (sorted.some((node, i) => node !== ul.children[i])) ul.append(...sorted);
  }

  function render() {
    const query = search.value.trim().toLocaleLowerCase().slice(0, 100);
    let found = 0, visibleGroups = 0;
    for (const group of groups) {
      let shown = 0;
      const inCategory = group.dataset.linkGroup === active;
      for (const item of group.querySelectorAll('[data-link-item]')) {
        const match = query ? item.dataset.linkSearchText.includes(query) : inCategory;
        item.hidden = !match;
        if (match) shown++;
      }
      group.hidden = shown === 0;
      if (shown) { found += shown; visibleGroups++; order(group); }
    }
    for (const button of buttons) button.setAttribute('aria-current', button.dataset.linkCategory === active ? 'true' : 'false');
    for (const button of sorts) button.setAttribute('aria-pressed', button.dataset.rlSort === sort ? 'true' : 'false');
    select.value = active;
    empty.hidden = found !== 0;
    const title = groups.find(group => group.dataset.linkGroup === active)?.querySelector('h2')?.textContent || 'this category';
    status.textContent = query
      ? `${found} ${found === 1 ? 'result' : 'results'}${visibleGroups > 1 ? ` in ${visibleGroups} categories` : ''}`
      : `${found} in ${title}`;
  }

  function syncUrl() {
    const url = new URL(location.href);
    url.searchParams.set('category', active);
    if (sort === 'az') url.searchParams.set('sort', 'az'); else url.searchParams.delete('sort');
    history.replaceState(null, '', url.pathname + url.search);
  }
  function choose(category) {
    if (!valid.has(category)) return;
    active = category; search.value = ''; syncUrl(); render();
    if (matchMedia('(max-width: 860px)').matches) $('.rl-content').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // Most helpful: the top six across every category.
  function renderTop() {
    const box = $('[data-rl-top]'), list = $('[data-rl-top-list]');
    const top = Object.entries(counts).filter(([id]) => byId.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    $('[data-rl-total]').textContent = nice.format(total);
    box.hidden = top.length < 3;
    if (box.hidden) return;
    list.replaceChildren(...top.map(([id, votes], i) => {
      const source = byId.get(id);
      const li = document.createElement('li');
      li.className = 'rl-top-item' + (i === 0 ? ' is-gold' : '');
      const a = source.querySelector('.rl-card').cloneNode(true);
      a.classList.add('rl-top-card');
      const rank = document.createElement('span');
      rank.className = 'rl-rank'; rank.textContent = `#${i + 1}`;
      const score = document.createElement('small');
      score.className = 'rl-top-votes'; score.textContent = `▲ ${nice.format(votes)}`;
      a.prepend(rank); a.querySelector('.rl-open').replaceWith(score);
      if (!a.querySelector('.rl-text small')) { const cat = document.createElement('small'); cat.textContent = source.dataset.cat; a.querySelector('.rl-text').append(cat); }
      li.append(a);
      return li;
    }));
  }

  async function loadCounts() {
    try {
      const response = await fetch('/api/link-votes', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('unavailable');
      counts = (await response.json()).counts || {};
    } catch { counts = {}; $('[data-rl-total]').textContent = '—'; return; }
    items.forEach(paintVote);
    renderTop();
    render();
  }

  async function vote(button) {
    const item = button.closest('[data-link-item]'), id = item.dataset.id;
    const up = !mine.has(id);
    // Optimistic: flip now, settle with the server's count.
    if (up) mine.add(id); else mine.delete(id);
    counts[id] = Math.max(0, count(id) + (up ? 1 : -1));
    paintVote(item); saveMine();
    button.disabled = true;
    try {
      const response = await fetch('/api/link-votes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: up ? 'up' : 'down' }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Voting is unavailable right now.');
      counts[id] = result.count;
      if (result.voted) mine.add(id); else mine.delete(id);
    } catch (error) {
      if (up) mine.delete(id); else mine.add(id);
      counts[id] = Math.max(0, count(id) + (up ? -1 : 1));
      status.textContent = error.message || 'Voting is unavailable right now.';
    } finally {
      button.disabled = false;
      paintVote(item); saveMine(); renderTop();
    }
  }

  for (const button of buttons) button.addEventListener('click', () => choose(button.dataset.linkCategory));
  for (const button of sorts) button.addEventListener('click', () => { sort = button.dataset.rlSort; syncUrl(); render(); });
  select.addEventListener('change', () => choose(select.value));
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 120); });
  root.addEventListener('click', event => {
    const button = event.target instanceof Element && event.target.closest('[data-vote]');
    if (button && !button.disabled) vote(button);
  });
  addEventListener('popstate', () => {
    const url = new URL(location.href);
    active = valid.has(url.searchParams.get('category')) ? url.searchParams.get('category') : groups[0].dataset.linkGroup;
    sort = url.searchParams.get('sort') === 'az' ? 'az' : 'top';
    search.value = ''; render();
  });
  items.forEach(paintVote);
  render();
  loadCounts();
}
