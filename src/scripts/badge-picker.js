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
    const disclosure = fallbackNode.closest('.fl-badge-code-details');
    if (disclosure) disclosure.open = true;
    const range = document.createRange(); range.selectNodeContents(fallbackNode);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return false;
  }
}

// The prompt asks for exactly what verification checks: the link and project ID kept intact,
// visible, and present in the page's HTML (the checker reads the page without running scripts).
export const aiBadgePrompt = code => `Add this Digivated badge to the footer of my website. Paste it exactly as written, keeping the link and the data-digivated-project attribute, and don't hide it, comment it out or add rel="nofollow". Put it directly in the page HTML (not added by JavaScript) so it appears on my home page. Don't change anything else.\n\n${code}`;

function aiBadgeGuide() {
  const step = (n, title, text) => el('li', {}, el('span', { textContent: String(n), ariaHidden: 'true' }), el('p', {}, el('strong', { textContent: title }), ' ', text));
  return el('div', { className: 'fl-ai-guide' },
    el('p', { className: 'fl-ai-guide-title', textContent: 'Add it with AI in about a minute' }),
    el('ol', {},
      step(1, 'Copy the prompt.', 'Tap Copy prompt on a style below. Your badge code is already inside.'),
      step(2, 'Paste it into your AI builder', 'such as Claude, ChatGPT, Cursor, Lovable, v0 or Bolt. It adds the badge to your footer.'),
      step(3, 'Publish your site,', 'then come back and check it. We look for the badge on your home page.'),
    ),
    el('p', { className: 'fl-ai-guide-note', textContent: 'Prefer to do it yourself? Use Copy and paste the code into your footer HTML.' }),
  );
}

// id: the project id (or a placeholder for the public examples page).
// copy: false shows code without Copy buttons (public examples).
// onCopy(style, copied): optional hook after a copy attempt.
// aiPrompt adds a second button that copies a ready-made assistant prompt.
export function badgePicker(id, { copy = true, count = null, onCopy, label = '', aiPrompt = false, collapseAlternatives = false } = {}) {
  const root = el('div', { className: 'fl-badges' });
  root.setAttribute('data-badge-picker', '');
  if (label) root.setAttribute('aria-label', label);
  const status = el('p', { className: 'fl-status fl-badge-status', role: 'status' });
  status.setAttribute('aria-live', 'polite');
  const alternatives = collapseAlternatives
    ? el('details', { className: 'fl-badge-more' }, el('summary', { textContent: 'More badge styles' }))
    : null;
  for (const style of BADGE_STYLES) {
    const code = badgeSnippet(id, style.key);
    const stage = el('div', { className: `fl-badge-stage is-${style.key}` });
    if (style.key === 'text') stage.append(el('span', { className: 'fl-badge-preview', textContent: '[ listed on Digivated ]' }));
    else stage.append(el('img', { src: badgePreviewSrc(style.key, count), width: BADGE_WIDTH, height: BADGE_HEIGHT, alt: `${style.label} badge preview`, decoding: 'async' }));
    const codeNode = el('code', { textContent: code });
    const name = el('div', {}, el('strong', { textContent: style.label }), el('span', { textContent: style.note }));
    if (style.key === 'dark') name.prepend(el('em', { className: 'fl-badge-tag', textContent: 'Recommended' }));
    const bar = el('div', { className: 'fl-badge-bar' }, name);
    if (copy) {
      const button = el('button', { type: 'button', className: 'fl-btn fl-btn-small fl-badge-copy', textContent: 'Copy' });
      button.setAttribute('data-copy-badge', style.key);
      button.setAttribute('aria-label', `Copy ${style.label} badge code`);
      const resetCopies = () => {
        root.querySelectorAll('.fl-badge-copy').forEach(b => { b.textContent = 'Copy'; b.classList.remove('is-copied'); });
        root.querySelectorAll('.fl-badge-prompt').forEach(b => { b.textContent = 'Copy prompt'; b.classList.remove('is-copied'); });
      };
      button.onclick = async () => {
        const copied = await copyText(code, codeNode);
        resetCopies();
        if (copied) { button.textContent = 'Copied ✓'; button.classList.add('is-copied'); setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('is-copied'); }, 2400); }
        status.dataset.tone = copied ? 'ok' : '';
        status.textContent = copied ? `${style.label} badge copied. Paste it into your site and publish.` : 'Code selected. Press Ctrl+C (or ⌘C) to copy it.';
        onCopy?.(style.key, copied);
      };
      if (aiPrompt) {
        const prompt = aiBadgePrompt(code);
        const promptButton = el('button', { type: 'button', className: 'fl-btn fl-btn-small fl-badge-prompt', textContent: 'Copy prompt' });
        promptButton.setAttribute('data-copy-badge-prompt', style.key);
        promptButton.setAttribute('aria-label', `Copy an AI prompt for the ${style.label} badge`);
        promptButton.onclick = async () => {
          const copied = await copyText(prompt, codeNode);
          resetCopies();
          if (copied) { promptButton.textContent = 'Copied ✓'; promptButton.classList.add('is-copied'); setTimeout(() => { promptButton.textContent = 'Copy prompt'; promptButton.classList.remove('is-copied'); }, 2400); }
          status.dataset.tone = copied ? 'ok' : '';
          status.textContent = copied ? 'Prompt copied. Paste it into your AI coding assistant.' : 'Code selected. Press Ctrl+C (or ⌘C) to copy it.';
        };
        bar.append(el('div', { className: 'fl-badge-actions' }, button, promptButton));
      } else bar.append(button);
    }
    const codeBlock = el('pre', { className: 'fl-badge-code' }, codeNode);
    const manualCode = alternatives
      ? el('details', { className: 'fl-badge-more fl-badge-code-details' }, el('summary', { textContent: 'View embed code' }), codeBlock)
      : codeBlock;
    const card = el('article', { className: 'fl-badge-card' }, stage, bar, manualCode);
    card.setAttribute('data-badge-style', style.key);
    if (alternatives && style.key !== 'dark') {
      alternatives.append(card);
    } else if (style.key === 'text') {
      const more = el('details', { className: 'fl-badge-more' }, el('summary', { textContent: 'Prefer a plain text link instead of an image?' }), card);
      root.append(more);
    } else root.append(card);
  }
  if (alternatives) root.append(alternatives);
  if (copy && aiPrompt) root.prepend(aiBadgeGuide());
  if (copy) root.append(status);
  return root;
}
