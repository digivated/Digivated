// Server-rendered, crawlable list of every public project, grouped by category.
// The interactive directory at /discover builds its list in the browser, so crawlers
// that do not run JavaScript see no products there. This page carries the same public
// facts as plain HTML links.
const ORIGIN = 'https://digivated.com';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = value => String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
const when = project => { const t = Date.parse(project.publishedAt || project.date || ''); return Number.isFinite(t) ? t : 0; };
const snippet = (text, max = 180) => {
  const plain = String(text || '').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 80)).replace(/[\s,;:.\-–—]+$/, '') + '…';
};
const PROJECT_URL = /^\/projects\/(?:listing\/)?[a-z0-9][a-z0-9-]{0,149}$/;

export function groupProjects(projects) {
  const groups = new Map();
  for (const project of projects) {
    if (!project?.name || !PROJECT_URL.test(project.pageUrl || '')) continue;
    const category = String(project.category || 'Other');
    groups.set(category, [...(groups.get(category) || []), project]);
  }
  for (const list of groups.values()) list.sort((a, b) => when(b) - when(a) || a.name.localeCompare(b.name));
  return [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

export function renderProjectIndexBody(projects) {
  const groups = groupProjects(projects);
  const total = groups.reduce((sum, [, list]) => sum + list.length, 0);
  if (!total) return '<section class="project-index"><h1>All projects</h1><p>No projects have been published yet.</p><p><a href="/discover">Open the directory</a></p></section>';
  const nav = groups.map(([name, list]) => `<li><a href="#${esc(slug(name))}">${esc(name)}</a> (${list.length})</li>`).join('');
  const sections = groups.map(([name, list]) => `<section id="${esc(slug(name))}" aria-labelledby="${esc(slug(name))}-title"><h2 id="${esc(slug(name))}-title">${esc(name)}</h2><ul>${list.map(p => `<li><a href="${esc(p.pageUrl)}">${esc(p.name)}</a>${p.creator ? ` <span>by ${esc(p.creator)}</span>` : ''}${p.description ? `<p>${esc(snippet(p.description))}</p>` : ''}</li>`).join('')}</ul></section>`).join('');
  return `<section class="project-index"><h1>All projects</h1><p>${total} independent ${total === 1 ? 'product' : 'products'} from makers, listed by category. Each links to its launch page. <a href="/discover">Search and filter in the directory</a>.</p><nav aria-label="Categories"><ul class="project-index-nav">${nav}</ul></nav>${sections}</section>`;
}

export function renderProjectIndex(template, projects) {
  const groups = groupProjects(projects);
  const total = groups.reduce((sum, [, list]) => sum + list.length, 0);
  const canonical = `${ORIGIN}/projects`;
  const description = total
    ? `Browse ${total} independent products by category, with the maker and a short description of each.`
    : 'Browse independent products published on Digivated.';
  const title = 'All projects · Digivated';
  const items = groups.flatMap(([, list]) => list).slice(0, 500);
  let html = template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`)
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/, () => `<link rel="canonical" href="${canonical}"/>`)
    .replace(/<meta\b[^>]*(?:name|property)="(description|og:description|twitter:description|og:title|twitter:title|og:url)"[^>]*>/g,
      (tag, key) => `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${esc(key === 'og:url' ? canonical : key.endsWith('title') ? title : description)}"/>`)
    .replace('<!--PROJECTS_BODY-->', () => renderProjectIndexBody(projects));
  html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (match, start, json, end) => {
    try {
      const data = JSON.parse(json);
      for (const node of data['@graph'] || []) {
        if (node['@type'] !== 'WebPage' && node['@type'] !== 'CollectionPage') continue;
        Object.assign(node, {
          '@type': 'CollectionPage', '@id': `${canonical}#webpage`, url: canonical, name: 'All projects', description,
          mainEntity: { '@type': 'ItemList', numberOfItems: items.length, itemListElement: items.map((p, index) => ({ '@type': 'ListItem', position: index + 1, name: p.name, url: `${ORIGIN}${p.pageUrl}` })) },
        });
      }
      return start + JSON.stringify(data).replace(/</g, '\\u003c') + end;
    } catch { return match; }
  });
  return html;
}
