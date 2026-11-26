import { badgePicker } from './badge-picker.js';
// Shared, plain-language status model for a creator's project.
// Used by Your Projects (dashboard) and the submission success screen.

const DAY = 86400000;
export const formatDate = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
};
// The server supplies the scheduled Monday at 9:00 AM Eastern.
export const localLaunchTime = value => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  return new Date(time).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
export const daysUntil = (value, now = Date.now()) => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return Math.ceil((time - now) / DAY);
};
const relativeDays = days => days === null ? '' : days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
const domain = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'your website'; } };

// Returns { key, label, tone, steps:[{label, state:'done'|'current'|'todo'|'stopped', detail}] }
export function projectStage(item, now = Date.now()) {
  const launch = item.launch?.kind === 'free' || item.launch?.scheduledAt ? item.launch : null;
  const live = ['approved', 'featured'].includes(item.status);
  const saved = { label: 'Saved', state: 'done', detail: formatDate(item.date) };
  if (item.status === 'rejected') return { key: 'rejected', label: 'Not selected', tone: 'bad', steps: [{ ...saved, label: 'Submitted' }, { label: 'Reviewed', state: 'stopped', detail: 'Not selected this time' }] };
  if (item.status === 'archived') return { key: 'archived', label: 'Archived', tone: 'muted', steps: [{ ...saved, label: 'Submitted' }, { label: 'Archived', state: 'stopped' }] };
  if (item.awaitingInstantPayment) return { key: 'payment', label: 'Payment needed', tone: 'warn', steps: [saved, { label: 'Payment', state: 'current', detail: 'Finish checkout' }, { label: 'Live', state: 'todo' }] };
  if (launch) {
    const verified = !!launch.badgeVerifiedAt;
    const when = formatDate(launch.scheduledAt), days = daysUntil(launch.scheduledAt, now);
    const steps = [
      saved,
      { label: 'Badge verified', state: verified || live ? 'done' : 'current', detail: verified ? formatDate(launch.badgeVerifiedAt) : live ? '' : 'Action needed' },
      { label: 'Launch day', state: live ? 'done' : verified ? 'current' : 'todo', detail: when ? `${when}${!live && days !== null && days > 0 ? ` · ${relativeDays(days)}` : ''}` : '' },
      { label: 'Live', state: live ? 'done' : 'todo', detail: live ? 'On Digivated' : '' },
    ];
    if (live) return { key: 'live', label: item.status === 'featured' ? 'Pro' : 'Live', tone: 'ok', steps };
    return verified ? { key: 'scheduled', label: 'Scheduled', tone: 'info', steps } : { key: 'badge', label: 'Action needed', tone: 'warn', steps };
  }
  const steps = [{ ...saved, label: 'Submitted' }, { label: 'In review', state: live ? 'done' : 'current' }, { label: 'Live', state: live ? 'done' : 'todo' }];
  if (live) return { key: 'live', label: item.status === 'featured' ? 'Pro' : 'Live', tone: 'ok', steps };
  return { key: 'review', label: 'In review', tone: 'info', steps };
}

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
};

export function trackerElement(stage) {
  const list = el('ol', { className: 'fl-tracker' });
  list.setAttribute('aria-label', 'Launch progress');
  for (const step of stage.steps) {
    const mark = { done: '[✓]', current: '[•]', todo: '[ ]', stopped: '[×]' }[step.state];
    const item = el('li', { className: `fl-step is-${step.state}` },
      el('span', { className: 'fl-step-mark', textContent: mark }),
      el('span', { className: 'fl-step-copy' }, el('strong', { textContent: step.label }), step.detail ? el('small', { textContent: step.detail }) : null));
    item.firstChild.setAttribute('aria-hidden', 'true');
    if (step.state === 'current') item.setAttribute('aria-current', 'step');
    item.append(el('span', { className: 'sr-only', textContent: { done: ' (done)', current: ' (current step)', todo: ' (not started)', stopped: ' (stopped)' }[step.state] }));
    list.append(item);
  }
  return list;
}

// The badge "next step" panel: copy, add to site, check.
export function badgeSteps(item, { onVerify } = {}) {
  const site = domain(item.url);
  const panel = el('div', { className: 'fl-next account-launch' });
  const status = el('p', { className: 'fl-status', role: 'status' });
  status.setAttribute('data-badge-status', '');
  status.setAttribute('aria-live', 'polite');
  const picker = badgePicker(item.id, { label: `Badge styles for ${item.name}`, aiPrompt: true });
  const verify = el('button', { type: 'button', className: 'button primary fl-btn-primary', textContent: 'Check my website' });
  verify.setAttribute('data-verify-badge', item.id);
  verify.onclick = async () => {
    if (!onVerify) return;
    verify.disabled = true; verify.textContent = 'Checking your website…'; status.dataset.tone = ''; status.textContent = `Looking for your badge on ${site}. This can take up to 30 seconds.`;
    try { await onVerify(item, status); }
    catch (error) { status.dataset.tone = 'error'; status.textContent = error.message || 'Verification failed. Try again.'; }
    finally { verify.disabled = false; verify.textContent = 'Check my website'; }
  };
  const days = daysUntil(item.launch.scheduledAt);
  panel.append(
    el('h4', { textContent: `Next: add your badge to ${site}` }),
    el('p', { className: 'fl-next-lede', textContent: 'Free launches need our badge on your site. It takes about two minutes.' }),
    picker,
    el('div', { className: 'fl-actions' }, verify),
    status,
    el('p', { className: 'fl-hint', textContent: days !== null && days > 0 ? `Your launch day is ${formatDate(item.launch.scheduledAt)} (${relativeDays(days)}). Verify any time before then.` : 'Your launch date has arrived. Verify now and your project goes live right away.' }),
    el('details', { className: 'fl-help' }, el('summary', { textContent: 'Badge not found? Common fixes' }),
      el('ul', {},
        el('li', { textContent: `Add it to the exact page you submitted (${item.url}), not a different page or subdomain.` }),
        el('li', { textContent: 'Make sure the change is published. Open your site in a private window to confirm the link is there.' }),
        el('li', { textContent: 'Paste the code exactly as copied. Don’t put it inside a comment, script, or hidden element.' }),
        el('li', { textContent: 'Using Cloudflare or bot protection? Allow the “Digivated project verifier” user agent so we can read your page.' }),
        el('li', { textContent: 'Built with React, Vite, Lovable or Bolt? Paste the badge into index.html, inside <body>. We can’t see links added by JavaScript.' }),
        el('li', { textContent: 'Still stuck? Use Report a bug or contact Digivated and include your project URL.' }))),
  );
  return panel;
}

// After the badge step: keep the embed code one click away (switch styles, re-add
// after a redesign, or add one to a paid launch). Cards render on first open.
export function badgeLater(item, stage) {
  if (!['scheduled', 'live', 'review'].includes(stage.key)) return null;
  const copy = stage.key === 'scheduled'
    ? 'Keep it on your site until launch day. You can switch styles any time.'
    : stage.key === 'live' ? 'Your badge shows live upvotes. Switch styles any time.'
    : 'Add a badge to your site to show off your listing and its upvotes.';
  const body = el('div', { className: 'fl-badge-later-body' }, el('p', { className: 'fl-hint', textContent: copy }));
  const details = el('details', { className: 'fl-badge-later' }, el('summary', {}, el('span', { textContent: 'Your badge' }), el('small', { textContent: 'Get the embed code' })), body);
  details.setAttribute('data-badge-later', item.id);
  details.addEventListener('toggle', () => {
    if (details.open && !body.querySelector('[data-badge-picker]')) body.append(badgePicker(item.id, { label: `Badge styles for ${item.name}`, aiPrompt: true }));
  });
  return details;
}

export function nextStepCopy(stage, item) {
  if (stage.key === 'scheduled') {
    const days = daysUntil(item.launch.scheduledAt);
    return `You’re all set. ${item.name} goes live automatically on ${formatDate(item.launch.scheduledAt)}${days > 0 ? ` (${relativeDays(days)})` : ''} at 9:00 AM Eastern, which is ${localLaunchTime(item.launch.scheduledAt)} your time. Keep the badge on your site. The Monday 9:00 AM Eastern publish will publish your project. No admin approval needed.`;
  }
  if (stage.key === 'review') return 'Your submission is waiting for review. We’ll notify you when it’s published.';
  if (stage.key === 'rejected') return 'This project wasn’t selected. Review the feedback below. You can submit an improved version later.';
  if (stage.key === 'archived') return 'This project is archived and no longer listed.';
  return '';
}
