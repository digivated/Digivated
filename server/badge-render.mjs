import { BADGE_WIDTH as W, BADGE_HEIGHT as H } from './badge-snippets.mjs';

// Pure SVG drawing for embed badges. No Node APIs, so the browser picker can
// draw exact previews without a network request.
// The Digivated mark, drawn into a dark tile so it reads on any badge background.
const mark = tile => `<g transform="translate(12 11)"><rect x=".5" y=".5" width="31" height="31" rx="6" fill="#111" stroke="${tile}"/><g transform="translate(4 4) scale(.3)"><path fill="#8398ac" d="M5 25c0-3 2-5 5-4l12 5v41c0 3-2 5-5 4L5 66z"/><path fill="#b1c4d5" d="M25 17c0-3 2-5 5-4l16 6v51c0 3-2 5-5 4l-16-6z"/><path fill="#edf3fc" d="M50 6c0-3 3-5 6-4l18 7c2 1 3 3 3 5v51c0 2-1 4-3 5l-18 8c-3 1-6-1-6-4z"/><path fill="#0a111c" d="M62 23c1.5 6 4 8.5 10 10-6 1.5-8.5 4-10 10-1.5-6-4-8.5-10-10 6-1.5 8.5-4 10-10z"/></g></g>`;
const SANS = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
export const BADGE_THEMES = {
  dark: { bg: '#0a0a0a', line: '#2e2e2e', dash: '', label: '#8a8a8a', name: '#f2f2f2', count: '#f2f2f2', rule: '#262626' },
  light: { bg: '#ffffff', line: '#d9d9d9', dash: '', label: '#6b6b6b', name: '#0a0a0a', count: '#0a0a0a', rule: '#e6e6e6' },
  terminal: { bg: '#050505', line: '#3a3a3a', dash: '4 3', label: '#7a7a7a', name: '#e8e8e8', count: '#e8e8e8', rule: '#2a2a2a' },
};

export function compactCount(n) {
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1000) return String(Math.floor(n));
  if (n < 10000) return (Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'k';
  if (n < 1e6) return Math.floor(n / 1000) + 'k';
  return (Math.floor(n / 1e5) / 10).toFixed(1).replace(/\.0$/, '') + 'm';
}

export function renderBadge(theme = 'dark', count = null) {
  const t = BADGE_THEMES[theme] || BADGE_THEMES.dark;
  const terminal = theme === 'terminal';
  const shown = compactCount(count);
  const title = `Featured on Digivated${shown ? ` · ${shown} upvotes` : ''}`;
  const label = terminal ? '$ featured on' : 'FEATURED ON';
  const name = terminal
    ? `<text x="54" y="39" fill="${t.name}" font-family="${MONO}" font-size="14" font-weight="700">[ DIGIVATED ]</text>`
    : `<text x="54" y="39" fill="${t.name}" font-family="${SANS}" font-size="17" font-weight="600" letter-spacing="-.3">Digivated</text>`;
  const right = shown
    ? `<path d="M218 16.5l4.5 6h-9z" fill="${t.count}"/><text x="218" y="40" text-anchor="middle" fill="${t.count}" font-family="${MONO}" font-size="13" font-weight="600">${shown}</text>`
    : `<text x="218" y="33" text-anchor="middle" fill="${t.count}" font-family="${MONO}" font-size="15">↗</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}"><title>${title}</title>`
    + `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="6" fill="${t.bg}" stroke="${t.line}"${t.dash ? ` stroke-dasharray="${t.dash}"` : ''}/>`
    + mark(theme === 'light' ? '#111' : t.line)
    + `<text x="54" y="22" fill="${t.label}" font-family="${MONO}" font-size="9" letter-spacing="1.4">${label}</text>`
    + name
    + `<line x1="190.5" y1="12" x2="190.5" y2="42" stroke="${t.rule}"/>`
    + right + `</svg>`;
}
