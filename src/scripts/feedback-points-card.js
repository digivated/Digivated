import { boostProgress, BOOST_POINTS_PER_VOTE } from '../lib/feedback-score.mjs';

// Fills every feedback points card with the visitor's own progress. The header
// (account-header.js) already fetches points for signed-in visitors and announces
// them with `digivated:points`; this only listens, so there is no extra request.
const cards = [...document.querySelectorAll('[data-feedback-points]')];
const header = document.querySelector('[data-site-header]');
let week = null, total = null;

// Draws progress toward the next bonus upvote as an ASCII bar: ▓ earned, ░ to go.
function drawCells(node, into) {
  if (!node) return;
  const done = document.createElement('b');
  done.textContent = '▓'.repeat(into);
  node.replaceChildren(done, '░'.repeat(BOOST_POINTS_PER_VOTE - into));
}

function paint() {
  const signedIn = header?.getAttribute('data-account') === 'signed-in';
  for (const card of cards) {
    const me = card.querySelector('[data-fp-me]');
    const signin = card.querySelector('[data-fp-signin]');
    if (signin) signin.hidden = signedIn;
    if (me) {
      me.hidden = total === null;
      if (total !== null) me.textContent = `✦ ${total} pts`;
    }
    const box = card.querySelector('[data-fp-progress]');
    if (!box) continue;
    box.hidden = week === null;
    if (week === null) continue;
    const p = boostProgress(week);
    drawCells(card.querySelector('[data-fp-bar]'), p.into);
    card.querySelector('[data-fp-progress-copy]').textContent = week === 0
      ? `No points this week yet. One detailed comment gets you halfway to a bonus upvote.`
      : `${week} point${week === 1 ? '' : 's'} this week${p.boosts ? ` = +${p.boosts} upvote${p.boosts === 1 ? '' : 's'} on your launch` : ''} · ${p.toNext} more to the next one.`;
  }
}

if (cards.length) {
  document.addEventListener('digivated:points', event => {
    if (Number.isFinite(event.detail?.total)) total = event.detail.total;
    if (Number.isFinite(event.detail?.week)) week = event.detail.week;
    paint();
  });
  document.addEventListener('digivated:points-awarded', event => {
    if (Number.isFinite(event.detail?.total)) total = event.detail.total;
    if (week !== null && Number.isFinite(event.detail?.points)) week += event.detail.points;
    paint();
  });
  if (header) new MutationObserver(paint).observe(header, { attributes: true, attributeFilter: ['data-account'] });
  paint();
}
