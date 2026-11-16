// Embed badge picker: one card per style with a live preview, a Copy button and
// the exact code. Previews are drawn locally (same SVG the server serves).
import { BADGE_STYLES, BADGE_WIDTH, BADGE_HEIGHT, badgeSnippet } from '../../server/badge-snippets.mjs';
import { renderBadge } from '../../server/badge-render.mjs';

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  children.flat().forEach(child => child != null && node.append(child));
  return node;
};
export const badgePreviewSrc = (style, count = null) =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(renderBadge(style, count));

async function copyText(text, fallbackNode) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const range = document.createRange(); range.selectNodeContents(fallbackNode);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return false;
  }
}

// id: the project id (or a placeholder for the public examples page).
// copy: false shows code without Copy buttons (public examples).
// onCopy(style, copied): optional hook after a copy attempt.
export function badgePicker(id, { copy = true, count = null, onCopy, label = '' } = {}) {
  const root = el('div', { className: 'fl-badges' });
  root.setAttribute('data-badge-picker', '');
  if (label) root.setAttribute('aria-label', label);
  const status = el('p', { className: 'fl-status fl-badge-status', role: 'status' });
  status.setAttribute('aria-live', 'polite');
  for (const style of BADGE_STYLES) {
    const code = badgeSnippet(id, style.key);
    const stage = el('div', { className: `fl-badge-stage is-${style.key}` });
    if (style.key === 'text') stage.append(el('span', { className: 'fl-badge-preview', textContent: '[ listed on Digivated ]' }));
    else stage.append(el('img', { src: badgePreviewSrc(style.key, count), width: BADGE_WIDTH, height: BADGE_HEIGHT, alt: `${style.label} badge preview`, decoding: 'async' }));
    const codeNode = el('code', { textContent: code });
    const bar = el('div', { className: 'fl-badge-bar' }, el('div', {}, el('strong', { textContent: style.label }), el('span', { textContent: style.note })));
    if (copy) {
      const button = el('button', { type: 'button', className: 'fl-btn fl-btn-small fl-badge-copy', textContent: 'Copy' });
      button.setAttribute('data-copy-badge', style.key);
      button.setAttribute('aria-label', `Copy ${style.label} badge code`);
      button.onclick = async () => {
        const copied = await copyText(code, codeNode);
        root.querySelectorAll('.fl-badge-copy').forEach(b => { b.textContent = 'Copy'; b.classList.remove('is-copied'); });
        if (copied) { button.textContent = 'Copied ✓'; button.classList.add('is-copied'); setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('is-copied'); }, 2400); }
        status.dataset.tone = copied ? 'ok' : '';
        status.textContent = copied ? `${style.label} badge copied. Paste it into your site and publish.` : 'Code selected. Press Ctrl+C (or ⌘C) to copy it.';
        onCopy?.(style.key, copied);
      };
      bar.append(button);
    }
    const card = el('article', { className: 'fl-badge-card' }, stage, bar, el('pre', { className: 'fl-badge-code' }, codeNode));
    card.setAttribute('data-badge-style', style.key);
    root.append(card);
  }
  if (copy) root.append(status);
  return root;
}
