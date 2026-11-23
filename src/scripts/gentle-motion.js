// Gentle motion: content softly rises in as it is first seen, and segmented controls
// glide their selection pill. Nothing is hidden before this script decides to animate it,
// and only content that has not been painted yet is ever hidden, so nothing flickers.
import '../styles/gentle-motion.css';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const main = document.querySelector('main#main');
const enabled = () => !reduce.matches && !navigator.connection?.saveData && 'IntersectionObserver' in window;

// Cards and rows across the site. Headings keep their own entrance in experience-motion.js.
const REVEAL = [
  '.dg-row:not(.is-loading):not(.dg-row-empty)', '.dg-list-head', '.dg-list-note', '.dg-rising', '.dg-dir-divider',
  '.shop-card', '.membership-access', '.membership-faq details',
  '.news-card', '.resource-card', '.rl-grid > *', '.category-index li', '.dg-thread-row',
  '.maker-card', '.project-account-card', '.settings-card', '.account-card',
  '.site-footer', '.dg-footer', 'footer > *',
].join(',');
const STAGGER = 45, MAX_STAGGER = 8;

// Rows that the page re-renders (votes, filters) keep their place without replaying.
const seen = new Set();
const keyOf = el => el.dataset.launchId || el.dataset.projectId || el.dataset.upcomingId || '';

let observer;
const pending = new Set();
let batch = [], batchFrame = 0;

function reveal(el) {
  observer?.unobserve(el);
  pending.delete(el);
  batch.push(el);
  if (!batchFrame) batchFrame = requestAnimationFrame(flush);
}
function flush() {
  batchFrame = 0;
  const items = batch.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  batch = [];
  items.forEach((el, i) => {
    el.style.setProperty('--gm-delay', `${Math.min(i, MAX_STAGGER) * STAGGER}ms`);
    el.dataset.gm = 'in';
    const done = event => {
      if (event && event.target !== el) return;
      el.removeEventListener('transitionend', done);
      if (el.dataset.gm === 'in') { delete el.dataset.gm; el.style.removeProperty('--gm-delay'); }
    };
    el.addEventListener('transitionend', done);
    setTimeout(done, 1300); // In case a transition never fires (hidden tab, display change).
  });
}

function hold(el) {
  if (el.dataset.gm || el.closest('[data-gm]') || el.closest('dialog, [role="dialog"], .site-menu-panel')) return;
  const key = keyOf(el);
  if (key) { if (seen.has(key)) return; seen.add(key); }
  el.dataset.gm = 'wait';
  pending.add(el);
  observer.observe(el);
}

function candidates(root) {
  const list = root.matches?.(REVEAL) ? [root] : [];
  return list.concat([...(root.querySelectorAll?.(REVEAL) || [])]);
}

function start() {
  if (!enabled()) return;
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
  }, { rootMargin: '0px', threshold: 0 });

  // Already painted content stays as it is; only what sits below the fold waits.
  const fold = innerHeight;
  for (const el of document.querySelectorAll(REVEAL)) {
    const key = keyOf(el);
    if (el.getBoundingClientRect().top < fold - 8) { if (key) seen.add(key); continue; }
    hold(el);
  }

  // Content the page renders later (rows replacing placeholders, filters, pages of results).
  // MutationObserver callbacks run before the next paint, so the waiting pose is never seen as a flash.
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      for (const el of candidates(node)) hold(el);
    }
  }).observe(main || document.body, { childList: true, subtree: true });

  // Leaving the tab or switching motion off shows everything immediately.
  const release = () => { for (const el of pending) { observer.unobserve(el); delete el.dataset.gm; } pending.clear(); };
  reduce.addEventListener?.('change', () => reduce.matches && release());
  addEventListener('pagehide', release);
  addEventListener('beforeprint', release);
  // Jumping to an anchor or find-in-page should never land on hidden content.
  addEventListener('hashchange', () => { for (const el of pending) if (el.getBoundingClientRect().top < innerHeight) reveal(el); });
}

// Selection pill glide for button groups (sort, category chips, collection switches, tabs).
const GROUPS = '[role="group"], [role="tablist"], .dg-dir-collection, .maker-navigation-sections';
function pressedIn(group) {
  return group.querySelector(':scope > :is([aria-pressed="true"], [aria-selected="true"])');
}
// Position relative to the group's padding box, including any horizontal scroll.
function boxOf(el, group) {
  const r = el.getBoundingClientRect(), g = group.getBoundingClientRect();
  return { x: r.left - g.left - group.clientLeft + group.scrollLeft, y: r.top - g.top - group.clientTop + group.scrollTop, w: r.width, h: r.height };
}
// Resting paint of a control, read without its colour transition getting in the way.
function paintOf(el) {
  const saved = [el.style.getPropertyValue('transition'), el.style.getPropertyPriority('transition')];
  el.style.setProperty('transition', 'none', 'important');
  const c = getComputedStyle(el);
  const paint = { bg: c.backgroundColor, radius: c.borderRadius, shadow: c.boxShadow };
  el.style.setProperty('transition', saved[0], saved[1]);
  if (!saved[0]) el.style.removeProperty('transition');
  return paint;
}
const clear = color => color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color);

function glide(group, from) {
  const to = pressedIn(group);
  if (!to) return;
  const end = boxOf(to, group);
  if (Math.abs(end.x - from.x) < 1 && Math.abs(end.y - from.y) < 1) return;
  const paint = paintOf(to);
  // Only segmented controls glide: chips with their own solid fill would hide the pill.
  const other = [...group.children].find(el => el !== to && el.matches('button, [role="tab"]'));
  if (clear(paint.bg) || (other && !clear(paintOf(other).bg))) return;
  if (getComputedStyle(group).position === 'static') group.style.position = 'relative';
  const pill = document.createElement('span');
  pill.className = 'gm-pill';
  pill.setAttribute('aria-hidden', 'true');
  // Important so group-level span rules (labels, counts) cannot repaint the pill.
  const set = (name, value) => pill.style.setProperty(name, value, 'important');
  set('left', '0px'); set('top', '0px'); set('margin', '0'); set('padding', '0'); set('border', '0');
  set('display', 'block'); set('position', 'absolute');
  set('background', paint.bg); set('border-radius', paint.radius); set('box-shadow', paint.shadow);
  Object.assign(pill.style, { width: `${from.w}px`, height: `${from.h}px`, translate: `${from.x}px ${from.y}px` });
  group.querySelectorAll(':scope > .gm-pill').forEach(old => old.remove());
  group.prepend(pill);
  group.dataset.gmGliding = '';
  pill.getBoundingClientRect();
  Object.assign(pill.style, { width: `${end.w}px`, height: `${end.h}px`, translate: `${end.x}px ${end.y}px` });
  const finish = () => { pill.remove(); if (!group.querySelector(':scope > .gm-pill')) delete group.dataset.gmGliding; };
  pill.addEventListener('transitionend', event => { if (event.propertyName === 'translate') finish(); });
  setTimeout(finish, 600);
}

document.addEventListener('click', event => {
  if (!enabled()) return;
  const button = event.target.closest?.('button, [role="tab"]');
  const group = button?.parentElement?.closest(GROUPS);
  if (!group || button.parentElement !== group) return;
  const current = pressedIn(group);
  if (!current || current === button) return;
  const from = boxOf(current, group);
  // Wait for the page's own handler to change the selection. Mutation callbacks run before
  // the next paint, so the pill starts at the old spot without a flash at the new one.
  const watch = new MutationObserver(() => {
    if (pressedIn(group) === current && current.isConnected) return;
    watch.disconnect(); clearTimeout(timer);
    glide(group, from);
  });
  watch.observe(group, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected'] });
  const timer = setTimeout(() => watch.disconnect(), 400);
}, true);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
