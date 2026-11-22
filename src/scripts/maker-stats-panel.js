// Maker analytics for one launch: totals with a 7 / 14 / 30 day switch, trend against the
// period before, visit rate, peak day, this week's rank, podium places, the newest comments
// and quick share actions. One request (range=30 returns 60 days) powers every period.
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
const BARS = '▁▂▃▄▅▆▇█';
const spark = values => { const max = Math.max(0, ...values); return values.map(v => max ? BARS[Math.min(7, Math.round(v / max * 7))] : BARS[0]).join(''); };
const FIELDS = [['views', 'Views'], ['visits', 'Visits'], ['upvotes', 'Upvotes'], ['comments', 'Comments']];
const PERIODS = [7, 14, 30];
const sum = (days, key) => days.reduce((total, day) => total + (Number(day[key]) || 0), 0);
const dayLabel = date => new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
function ago(value) {
  const time = Date.parse(value); if (!Number.isFinite(time)) return '';
  const minutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24); return days < 14 ? `${days}d ago` : new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function trend(current, previous) {
  if (!previous && !current) return null;
  if (!previous) return { text: 'New', tone: 'up', label: 'New activity this period' };
  const change = Math.round((current - previous) / previous * 100);
  if (change === 0) return { text: '0%', tone: 'flat', label: 'Same as the period before' };
  if (change >= 300) return { text: `↑ ${Math.round(current / previous)}×`, tone: 'up', label: `${Math.round(current / previous)} times the period before` };
  return { text: `${change > 0 ? '↑' : '↓'} ${Math.abs(change)}%`, tone: change > 0 ? 'up' : 'down', label: `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)}% on the period before` };
}

export function statsPanel(item, session) {
  const box = el('section', null, 'dg-stats'); box.setAttribute('aria-label', `Launch stats for ${item.name}`);
  const top = el('div', null, 'dg-stats-top');
  const head = el('p', 'All-time totals · bars show the last 14 days', 'dg-stats-head');
  const periods = el('div', null, 'dg-stats-periods'); periods.setAttribute('role', 'group'); periods.setAttribute('aria-label', 'Time period'); periods.hidden = true;
  top.append(head, periods);
  const status = el('p', 'Loading stats…', 'dg-stats-status'); status.setAttribute('role', 'status');
  box.append(top, status);
  fetch('/api/maker-stats?range=30&id=' + encodeURIComponent(item.id), { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store', signal: AbortSignal.timeout(20000) }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || 'Stats are temporarily unavailable.');
    status.remove();
    // Older or partial responses only carry "days": fall back to those and skip trends.
    const history = Array.isArray(data.history) ? data.history : Array.isArray(data.days) ? data.days : [];
    const hasTrend = Array.isArray(data.history) && data.history.length >= 60;
    const grid = el('div', null, 'dg-stats-grid');
    const insights = el('div', null, 'dg-stats-insights');
    let period = 14;
    const tiles = FIELDS.map(([key, label]) => {
      const tile = el('div', null, 'dg-stat');
      const total = el('strong'), recent = el('small', null, 'dg-stat-recent'), change = el('span', null, 'dg-stat-trend'), bars = el('span', null, 'dg-stat-spark');
      bars.setAttribute('aria-hidden', 'true');
      const line = el('span', null, 'dg-stat-line'); line.append(recent, change);
      tile.append(el('span', label, 'dg-stat-label'), total, line, bars);
      grid.append(tile);
      return { key, label, total, recent, change, bars };
    });
    function paint() {
      const days = history.slice(-period), before = hasTrend ? history.slice(-period * 2, -period) : [];
      head.textContent = `All-time totals · bars show the last ${period} days`;
      for (const tile of tiles) {
        const now = sum(days, tile.key);
        const all = data.allTime ? Math.max(Number(data.allTime[tile.key]) || 0, Number(data.totals?.[tile.key]) || 0, now) : (Number(data.totals?.[tile.key]) || now);
        tile.total.textContent = all.toLocaleString();
        tile.recent.textContent = `+${now.toLocaleString()} in ${period} days`;
        const t = hasTrend ? trend(now, sum(before, tile.key)) : null;
        tile.change.hidden = !t;
        if (t) { tile.change.textContent = t.text; tile.change.dataset.tone = t.tone; tile.change.title = t.label; tile.change.setAttribute('aria-label', t.label); }
        tile.bars.textContent = spark(days.map(day => Number(day[tile.key]) || 0));
        tile.bars.title = `${tile.label} per day, oldest first`;
      }
      const opened = sum(days, 'views'), clicked = sum(days, 'visits');
      const peak = days.reduce((best, day) => (Number(day.views) || 0) > (Number(best?.views) || 0) ? day : best, null);
      const cards = [];
      if (opened) cards.push(['Visit rate', `${Math.round(clicked / opened * 1000) / 10}%`, 'Share of page opens that clicked through to your site']);
      if (peak) cards.push(['Peak day', dayLabel(peak.date), `${Number(peak.views).toLocaleString()} page opens, your busiest day`]);
      const engaged = sum(days, 'upvotes') + sum(days, 'comments');
      if (opened) cards.push(['Engagement', `${engaged.toLocaleString()}`, 'Upvotes and comments together']);
      insights.replaceChildren(...cards.map(([label, value, hint]) => { const card = el('div', null, 'dg-insight'); card.append(el('span', label, 'dg-insight-label'), el('strong', value), el('small', hint)); return card; }));
      insights.hidden = !cards.length;
      periods.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.period) === period)));
    }
    if (history.length >= 30) {
      for (const value of PERIODS) { const button = el('button', `${value}D`); button.type = 'button'; button.dataset.period = String(value); button.setAttribute('aria-label', `Last ${value} days`); button.onclick = () => { period = value; paint(); }; periods.append(button); }
      periods.hidden = false;
    }
    box.append(grid, insights);
    paint();

    const week = el('p', null, 'dg-stats-week');
    if (data.week?.fresh) week.textContent = `This week: fresh start. Your rank shows ${new Date(data.week.endsAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.`;
    else if (data.week) { week.append('This week: ', el('b', `#${data.week.rank} of ${data.week.of}`), ` · launch score ${data.week.score} (${data.week.upvotes} upvote${data.week.upvotes === 1 ? '' : 's'}, ${data.week.commenters} commenter${data.week.commenters === 1 ? '' : 's'}${data.week.points ? `, ${data.week.points} feedback pts` : ''}) · `); const how = el('a', 'How ranking works'); how.href = '/winners#how-ranking-works'; week.append(how); }
    if (week.childNodes.length) box.append(week);
    if (data.places?.length) {
      const places = el('p', null, 'dg-stats-places');
      for (const place of data.places) places.append(el('span', `★ #${place.rank} · week of ${new Date(place.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`, 'dg-badge dg-badge-medal is-' + ({ 1: 'gold', 2: 'silver', 3: 'bronze' }[place.rank])));
      box.append(places);
    }

    // Newest comments, with a way to reply on the launch page.
    if (Array.isArray(data.comments) && data.comments.length) {
      const section = el('div', null, 'dg-stats-comments');
      const title = el('div', null, 'dg-stats-subhead'); title.append(el('span', 'Latest comments'));
      if (item.pageUrl) { const reply = el('a', 'Reply on your page →'); reply.href = item.pageUrl + '#feedback'; title.append(reply); }
      const list = el('ul');
      for (const comment of data.comments) {
        const row = el('li'); const meta = el('p', null, 'dg-comment-meta'); meta.append(el('b', comment.name), el('span', ago(comment.date)));
        row.append(meta, el('p', comment.body, 'dg-comment-body')); list.append(row);
      }
      section.append(title, list); box.append(section);
    }

    // Share: the fastest way to bring more people to a launch.
    if (item.pageUrl) {
      const link = new URL(item.pageUrl, location.origin).href;
      const share = el('div', null, 'dg-stats-share');
      share.append(el('span', 'Share your launch', 'dg-stats-share-title'));
      const actions = el('div', null, 'dg-stats-share-actions');
      const copy = el('button', 'Copy link', 'dg-share-button'); copy.type = 'button';
      copy.onclick = async () => { try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed'; } setTimeout(() => { copy.textContent = 'Copy link'; }, 1600); };
      const post = el('a', 'Post on X', 'dg-share-button'); post.href = 'https://x.com/intent/post?text=' + encodeURIComponent(`I just launched ${item.name} on Digivated. Check it out and tell me what you think:`) + '&url=' + encodeURIComponent(link); post.target = '_blank'; post.rel = 'noopener noreferrer';
      const linkedin = el('a', 'LinkedIn', 'dg-share-button'); linkedin.href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(link); linkedin.target = '_blank'; linkedin.rel = 'noopener noreferrer';
      actions.append(copy, post, linkedin); share.append(actions); box.append(share);
    }

    if (data.award) {
      const award = el('div', null, 'dg-stats-award'); let theme = 'dark';
      const preview = el('img'); preview.width = 250; preview.height = 54; preview.alt = `#${data.award.rank} launch of the week badge`;
      const code = el('pre', null, 'dg-stats-code'); const copy = el('button', 'Copy badge code', 'dg-btn'); copy.type = 'button';
      const picker = el('div', null, 'dg-stats-themes'); picker.setAttribute('role', 'group'); picker.setAttribute('aria-label', 'Badge style');
      const show = () => { preview.src = `/badge/${encodeURIComponent(item.id)}?theme=${theme}&award=week`; code.textContent = data.award.snippets[theme]; picker.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === theme))); };
      for (const key of ['dark', 'light', 'terminal']) { const b = el('button', key[0].toUpperCase() + key.slice(1)); b.type = 'button'; b.dataset.theme = key; b.onclick = () => { theme = key; show(); }; picker.append(b); }
      copy.onclick = async () => { try { await navigator.clipboard.writeText(data.award.snippets[theme]); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy badge code'; }, 1600); } catch { copy.textContent = 'Select the code to copy'; } };
      award.append(el('p', 'Show your podium place on your site:', 'dg-stats-award-title'), preview, picker, code, copy); show(); box.append(award);
    }
  }).catch(error => { status.textContent = error.message || 'Stats are temporarily unavailable.'; });
  return box;
}
