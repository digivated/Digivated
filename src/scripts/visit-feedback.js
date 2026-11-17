import { REVIEW_FIELD_MAX, REVIEW_MIN_SECONDS, impressions, scoreReview } from '../lib/feedback-score.mjs';

// After a visitor opens a product from Digivated and comes back, ask for a short,
// structured review. Useful reviews from signed-in visitors earn points.
const KEY = 'digivated:pending-visit';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };
const write = value => { try { value ? sessionStorage.setItem(KEY, JSON.stringify(value)) : sessionStorage.removeItem(KEY); } catch { /* optional */ } };
const elapsed = visit => Math.max(0, Math.floor((Date.now() - visit.startedAt) / 1000));
const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

async function session() {
  try { const { accountSession } = await import('./account-session.js'); const result = await accountSession(); return result.state === 'signed-in' ? result.session : null; } catch { return null; }
}
async function post(body, token) {
  const response = await fetch('/api/feedback-points', { method: 'POST', cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'Try again in a moment.');
  return data;
}

/* ---------- Prompt ---------- */
const panel = el('section', null, 'dg-review');
panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'dg-review-title'); panel.hidden = true;
const head = el('header', null, 'dg-review-head');
const art = el('span', null, 'dg-review-logo');
const titles = el('div');
const kicker = el('p', 'Welcome back', 'dg-label');
const title = el('h2', 'How was it?'); title.id = 'dg-review-title';
const time = el('p', null, 'dg-review-time');
titles.append(kicker, title, time);
const close = el('button', '×', 'dg-review-close'); close.type = 'button'; close.setAttribute('aria-label', 'Close feedback');
head.append(art, titles, close);

const form = el('form', null, 'dg-review-form');
const chips = el('fieldset', null, 'dg-review-chips');
chips.append(el('legend', 'First impression'));
for (const [value, label] of Object.entries(impressions)) {
  const option = el('label'); const input = el('input'); input.type = 'radio'; input.name = 'impression'; input.value = value;
  option.append(input, el('span', label)); chips.append(option);
}
const field = (name, label, placeholder) => {
  const wrap = el('label', null, 'dg-review-field'); wrap.append(el('span', label));
  const area = el('textarea'); area.name = name; area.rows = 2; area.maxLength = REVIEW_FIELD_MAX; area.placeholder = placeholder;
  wrap.append(area); return [wrap, area];
};
const [worksWrap, works] = field('works', 'What works?', 'The onboarding is fast and the demo explains it…');
const [improveWrap, improve] = field('improve', 'What would you improve?', 'I wasn’t sure what the pricing includes…');
const nameWrap = el('label', null, 'dg-review-field dg-review-name'); nameWrap.append(el('span', 'Name (optional)'));
const name = el('input'); name.name = 'name'; name.maxLength = 40; name.placeholder = 'Guest'; nameWrap.append(name);
const trap = el('input'); trap.name = 'company'; trap.tabIndex = -1; trap.autocomplete = 'off'; trap.className = 'sr-only'; trap.setAttribute('aria-hidden', 'true');

const meter = el('div', null, 'dg-meter');
const meterBar = el('span', null, 'dg-meter-bar'); const meterFill = el('span', null, 'dg-meter-fill'); meterBar.append(meterFill);
const meterChecks = el('ul', null, 'dg-meter-checks');
const checkItems = { specific: ['Specific', 5], both: ['Both sides', 3], detailed: ['Detailed', 5], impression: ['Impression', 1] };
const checkNodes = Object.fromEntries(Object.entries(checkItems).map(([key, [label, points]]) => { const li = el('li', `${label} +${points}`); meterChecks.append(li); return [key, li]; }));
const meterNote = el('p', null, 'dg-meter-note'); meterNote.setAttribute('aria-live', 'polite');
meter.append(meterBar, meterChecks, meterNote);

const actions = el('div', null, 'dg-review-actions');
const later = el('button', 'Not now', 'dg-btn'); later.type = 'button';
const send = el('button', 'Send feedback', 'dg-btn dg-btn-primary'); send.type = 'submit';
actions.append(later, send);
const status = el('p', null, 'dg-review-status'); status.setAttribute('role', 'status');
form.append(chips, worksWrap, improveWrap, nameWrap, trap, meter, actions, status);

const done = el('div', null, 'dg-review-done'); done.hidden = true;
panel.append(head, form, done);
document.body.append(panel);

let visit = null, account = null, returnFocus = null, ticker;

function preview() {
  if (!visit) return;
  const seconds = elapsed(visit);
  const score = scoreReview({ works: works.value, improve: improve.value, impression: form.elements.impression.value, seconds });
  for (const [key, node] of Object.entries(checkNodes)) node.classList.toggle('is-on', score.useful && score.checks[key] || (key === 'impression' && score.checks.impression));
  const pts = score.useful ? score.points : 0;
  meterFill.style.transform = `scaleX(${pts / 14})`;
  const eligible = account && seconds >= REVIEW_MIN_SECONDS;
  send.textContent = pts && eligible ? `Send feedback · +${pts} pts` : 'Send feedback';
  meterNote.replaceChildren();
  if (!account) { meterNote.append('Feedback is public to the maker. '); const a = el('a', 'Log in'); a.href = '/login?mode=signup'; meterNote.append(a, ' to earn points that boost your own launch.'); }
  else if (seconds < REVIEW_MIN_SECONDS) meterNote.textContent = `Points need ${REVIEW_MIN_SECONDS}s+ on the product. You spent ${seconds}s, so this one won’t earn points.`;
  else if (!score.useful) meterNote.textContent = 'Add a little detail to make it count: what you tried, and what you’d change.';
  else meterNote.textContent = `${pts} of 14 points. Every 10 points this week adds an upvote to your launch.`;
}
[works, improve].forEach(area => area.addEventListener('input', preview));
chips.addEventListener('change', preview);

function hide(restore = true) {
  clearInterval(ticker);
  const finish = () => { panel.hidden = true; panel.classList.remove('is-leaving'); };
  if (reduced.matches) finish(); else { panel.classList.add('is-leaving'); setTimeout(finish, 180); }
  write(null);
  if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}
close.addEventListener('click', () => hide());
later.addEventListener('click', () => hide());
panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); hide(); } });

async function open(pending) {
  visit = pending;
  returnFocus = document.querySelector(`[data-visit-project="${CSS.escape(visit.id)}"]`) || document.activeElement;
  form.reset(); form.hidden = false; done.hidden = true; done.replaceChildren(); status.textContent = '';
  title.textContent = `How was ${visit.name}?`;
  art.replaceChildren(el('span', visit.name.slice(0, 2).toUpperCase()));
  if (visit.image) { const img = el('img'); img.src = visit.image; img.alt = ''; img.width = 40; img.height = 40; img.addEventListener('error', () => img.remove(), { once: true }); art.append(img); }
  const tick = () => { time.textContent = `${clock(elapsed(visit))} since you opened it`; };
  tick(); clearInterval(ticker); ticker = setInterval(tick, 1000);
  panel.hidden = false;
  account = null; preview();
  works.focus({ preventScroll: true });
  account = await session();
  nameWrap.hidden = !!account;
  preview();
}

function burst(points, total) {
  done.replaceChildren();
  const big = el('p', null, 'dg-award'); big.append(el('strong', `+${points}`), el('span', 'points'));
  const sparks = el('span', null, 'dg-sparks'); sparks.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 14; i++) { const s = el('span', ['✦', '+', '·', '*'][i % 4]); s.style.setProperty('--a', `${(360 / 14) * i}deg`); s.style.setProperty('--d', `${48 + (i % 3) * 18}px`); sparks.append(s); }
  big.append(sparks);
  done.append(big, el('p', `You now have ${total} points. They lift your own launch on this week’s board.`, 'dg-award-copy'));
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!visit) return;
  send.disabled = true; send.setAttribute('aria-busy', 'true'); status.textContent = 'Sending…';
  try {
    const data = await post({ action: 'review', id: visit.id, token: visit.token, impression: form.elements.impression.value, works: works.value, improve: improve.value, name: name.value, company: trap.value }, account?.access_token);
    form.hidden = true; done.hidden = false;
    if (data.points > 0) {
      burst(data.points, data.total);
      document.dispatchEvent(new CustomEvent('digivated:points-awarded', { detail: { points: data.points, total: data.total } }));
    } else {
      const reasons = {
        'signed-out': data.possible ? `This review was worth ${data.possible} points. Log in next time to collect them.` : 'Log in next time to collect points for useful reviews.',
        'own-project': 'Thanks. Reviews on your own project don’t earn points.',
        'not-specific': 'Saved. More specific reviews earn points next time.',
        'short-visit': `Saved. Spend ${REVIEW_MIN_SECONDS}s+ on a product to earn points for reviewing it.`,
        'already-rewarded': 'Saved. You’ve already earned points for this product.',
        'daily-cap': 'Saved. You’ve reached today’s 60-point limit.',
      };
      done.append(el('p', 'Feedback sent', 'dg-award-title'), el('p', reasons[data.reason] || data.message, 'dg-award-copy'));
      if (data.reason === 'signed-out') { const a = el('a', 'Log in or sign up →', 'dg-quiet-link'); a.href = '/login?mode=signup'; done.append(a); }
    }
    write(null);
    const finish = el('button', 'Done', 'dg-btn'); finish.type = 'button'; finish.addEventListener('click', () => hide()); done.append(finish);
    finish.focus({ preventScroll: true });
  } catch (error) {
    status.textContent = error.message;
  } finally { send.disabled = false; send.removeAttribute('aria-busy'); }
});

/* ---------- Visit tracking ---------- */
document.addEventListener('click', event => {
  const link = event.target.closest?.('a[data-visit-project]');
  if (!link || event.defaultPrevented || event.button > 1) return;
  const pending = { id: link.dataset.visitProject, name: link.dataset.visitName || 'this product', image: link.dataset.visitImage || '', startedAt: Date.now(), token: '' };
  write(pending);
  post({ action: 'visit', id: pending.id }).then(({ token }) => { const current = read(); if (current?.id === pending.id && current.startedAt === pending.startedAt) write({ ...current, token }); }).catch(() => {});
});
const maybePrompt = () => {
  if (document.hidden || !panel.hidden) return;
  const pending = read();
  if (!pending?.id || Date.now() - pending.startedAt < 4000 || Date.now() - pending.startedAt > 6 * 3_600_000) return;
  open(pending);
};
document.addEventListener('visibilitychange', maybePrompt);
addEventListener('focus', maybePrompt);
addEventListener('pageshow', () => setTimeout(maybePrompt, 400));
