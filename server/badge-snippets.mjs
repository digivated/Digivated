// Embed badge code shared by the server (launch flow) and the browser (badge picker).
// Every style keeps the same anchor (href + data-digivated-project), so badge
// verification is identical whichever style a creator picks, and badges copied
// before images existed keep verifying.
export const BADGE_STYLES = [
  { key: 'dark', label: 'Dark', note: 'For light or dark sites' },
  { key: 'light', label: 'Light', note: 'For light pages' },
  { key: 'terminal', label: 'Terminal', note: 'ASCII, monospace' },
  { key: 'text', label: 'Text link', note: 'No image, just a link' },
];
export const BADGE_WIDTH = 250;
export const BADGE_HEIGHT = 54;
export const listingUrl = id => `https://digivated.com/projects/listing/${id}`;
export const badgeImageUrl = (id, style = 'dark', origin = 'https://digivated.com') =>
  `${origin}/badge/${encodeURIComponent(id)}?theme=${style}`;

export function badgeSnippet(id, style = 'dark') {
  if (style === 'text') return `<a href="${listingUrl(id)}" data-digivated-project="${id}">[ listed on Digivated ]</a>`;
  const theme = BADGE_STYLES.some(s => s.key === style) ? style : 'dark';
  return `<a href="${listingUrl(id)}" data-digivated-project="${id}" target="_blank" rel="noopener">\n  <img src="${badgeImageUrl(id, theme)}" alt="Featured on Digivated" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}">\n</a>`;
}

export const badgeSnippets = id => Object.fromEntries(BADGE_STYLES.map(s => [s.key, badgeSnippet(id, s.key)]));
