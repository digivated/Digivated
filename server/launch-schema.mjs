// JSON-LD for a published project page. Keeps the site-wide Organization and WebSite nodes
// from the page template so the WebPage's isPartOf/publisher references resolve.
const SITE = 'https://digivated.com';
const validDate = value => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
};
const httpUrl = value => /^https?:\/\//i.test(value || '') ? value : '';

function sharedNodes(templateSchema) {
  try {
    const graph = JSON.parse(templateSchema)['@graph'];
    const nodes = graph.filter(node => node && ['Organization', 'WebSite'].includes(node['@type']));
    if (nodes.length === 2) return nodes;
  } catch { /* Fall back to minimal site nodes below. */ }
  return [
    { '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'Digivated', url: `${SITE}/` },
    { '@type': 'WebSite', '@id': `${SITE}/#website`, name: 'Digivated', url: `${SITE}/`, publisher: { '@id': `${SITE}/#organization` }, inLanguage: 'en' },
  ];
}

export function launchSchemaGraph({ item, canonical, description, templateSchema = '' }) {
  const published = validDate(item.publishedAt || item.date);
  const website = httpUrl(item.website || item.ctaUrl);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      ...sharedNodes(templateSchema),
      {
        '@type': 'WebPage', '@id': `${canonical}#webpage`, name: item.name, description, url: canonical,
        isPartOf: { '@id': `${SITE}/#website` }, publisher: { '@id': `${SITE}/#organization` },
        breadcrumb: { '@id': `${canonical}#breadcrumb` }, mainEntity: { '@id': `${canonical}#project` },
        inLanguage: 'en', isAccessibleForFree: true, ...(published ? { datePublished: published } : {}),
      },
      {
        '@type': 'CreativeWork', '@id': `${canonical}#project`, name: item.name, description, mainEntityOfPage: { '@id': `${canonical}#webpage` },
        ...(item.category ? { genre: item.category } : {}), ...(website ? { sameAs: website } : {}),
        ...(published ? { datePublished: published } : {}),
      },
      {
        '@type': 'BreadcrumbList', '@id': `${canonical}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Projects', item: `${SITE}/discover` },
          { '@type': 'ListItem', position: 3, name: item.name, item: canonical },
        ],
      },
    ],
  };
}

export function launchSchemaScript(args) {
  return `<script type="application/ld+json">${JSON.stringify(launchSchemaGraph(args)).replace(/</g, '\\u003c')}</script>`;
}
