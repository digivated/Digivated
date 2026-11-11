import { analyticsToken } from './visitors.mjs';

const productEvents = [
  'project_open', 'project_site_visit', 'project_feedback_open', 'project_submit',
  'membership_checkout', 'membership_verified', 'news_category_select',
  'creator_post_publish', 'creator_reply_publish',
];
const dateRanges = [{ startDate: '28daysAgo', endDate: 'yesterday' }];
const metric = name => ({ name });
const dimension = name => ({ name });
const count = value => {
  const n = Number(value ?? 0);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
};
const rows = (report, limit = 28) => (report?.rows || []).slice(0, limit);

// Aggregated GA4 reporting for the authenticated owner dashboard only.
export async function adminAnalytics({ env = process.env, fetcher = fetch, now = new Date() } = {}) {
  const token = await analyticsToken({ env, fetcher, now });
  if (!token) return { status: 'unconfigured' };
  const requests = [
    { dateRanges, metrics: ['activeUsers', 'sessions', 'screenPageViews'].map(metric) },
    { dateRanges, dimensions: [dimension('date')], metrics: ['activeUsers', 'sessions'].map(metric), orderBys: [{ dimension: { dimensionName: 'date' } }], limit: '28' },
    { dateRanges, dimensions: [dimension('sessionSourceMedium')], metrics: [metric('sessions')], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: '8' },
    { dateRanges, dimensions: [dimension('pagePath')], metrics: [metric('screenPageViews')], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: '8' },
    { dateRanges, dimensions: [dimension('eventName')], metrics: [metric('eventCount')], dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: productEvents } } }, limit: '20' },
  ];
  const response = await fetcher(`https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:batchRunReports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return { status: 'unavailable' };
  const data = await response.json();
  if (!Array.isArray(data.reports) || data.reports.length !== requests.length) return { status: 'unavailable' };
  const [summary, trend, sources, pages, actions] = data.reports;
  const totals = rows(summary, 1)[0]?.metricValues || [];
  return {
    status: 'ready',
    updatedAt: now.toISOString(),
    period: 'Last 28 complete days',
    totals: { activeUsers: count(totals[0]?.value), sessions: count(totals[1]?.value), pageViews: count(totals[2]?.value) },
    trend: rows(trend).map(row => ({ date: String(row.dimensionValues?.[0]?.value || ''), users: count(row.metricValues?.[0]?.value), sessions: count(row.metricValues?.[1]?.value) })).filter(row => /^\d{8}$/.test(row.date)),
    sources: rows(sources, 8).map(row => ({ label: String(row.dimensionValues?.[0]?.value || 'Unknown').slice(0, 80), sessions: count(row.metricValues?.[0]?.value) })),
    pages: rows(pages, 8).map(row => ({ path: String(row.dimensionValues?.[0]?.value || '/').slice(0, 100), views: count(row.metricValues?.[0]?.value) })).filter(row => row.path.startsWith('/')),
    actions: rows(actions, 20).map(row => ({ name: String(row.dimensionValues?.[0]?.value || ''), count: count(row.metricValues?.[0]?.value) })).filter(row => productEvents.includes(row.name)),
  };
}
