// Share links for a page, used on launch pages (server) and in maker analytics (browser).
// Every link opens the platform's own share screen; nothing is posted without the person.
const enc = encodeURIComponent;

export function shareLinks({ url, title = '', text = '', image = '' } = {}) {
  let page;
  try { page = new URL(url); } catch { return []; }
  if (!/^https?:$/.test(page.protocol)) return [];
  const link = page.href;
  const line = text || title;
  // Pinterest needs a picture. Only real hosted images qualify (never data: URLs).
  let media = '';
  try { const picture = new URL(image, link); if (/^https?:$/.test(picture.protocol)) media = picture.href; } catch {}
  if (!media) media = new URL('/digivated-social-card.png', link).href;
  return [
    { key: 'x', label: 'X', href: `https://x.com/intent/post?text=${enc(line)}&url=${enc(link)}` },
    { key: 'pinterest', label: 'Pinterest', href: `https://pinterest.com/pin/create/button/?url=${enc(link)}&media=${enc(media)}&description=${enc(line)}` },
    { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(link)}` },
    { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(link)}` },
    { key: 'reddit', label: 'Reddit', href: `https://www.reddit.com/submit?url=${enc(link)}&title=${enc(title || line)}` },
    { key: 'threads', label: 'Threads', href: `https://www.threads.net/intent/post?text=${enc(`${line} ${link}`.trim())}` },
    { key: 'bluesky', label: 'Bluesky', href: `https://bsky.app/intent/compose?text=${enc(`${line} ${link}`.trim())}` },
    { key: 'email', label: 'Email', href: `mailto:?subject=${enc(title || line)}&body=${enc(`${line}\n\n${link}`.trim())}` },
  ];
}
