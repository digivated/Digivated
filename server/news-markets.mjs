// Public-domain Federal Reserve observations, kept separate from editorial news.
// FRED marks these government-sourced series Public Domain: Citation Requested.
// Do not substitute SP500/DJIA/NASDAQCOM: those require redistribution permission.
// Each observation retains its actual source date;
// a retrieval timestamp is never substituted for a market observation date.
const ORIGIN = 'https://fred.stlouisfed.org';
const MAX_BYTES = 64 * 1024;
const DAY = 86400000;
const SERIES = [
  { id: 'DGS10', symbol: 'UST10Y', label: '10Y Treasury yield', kind: 'yield', maxAgeDays: 7 },
  { id: 'DGS2', symbol: 'UST2Y', label: '2Y Treasury yield', kind: 'yield', maxAgeDays: 7 },
  { id: 'DTWEXBGS', symbol: 'USDBROAD', label: 'Broad U.S. dollar', kind: 'index', maxAgeDays: 14 },
];
const SOURCE = { sourceName: 'FRED · Federal Reserve Bank of St. Louis', sourceUrl: ORIGIN, delayLabel: 'Daily observations' };
const unavailable = () => ({ status: 'unavailable', items: [], updatedAt: null, ...SOURCE });

function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
async function boundedCsv(response) {
  const length = Number(response.headers?.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('Snapshot too large');
  const type = response.headers?.get('content-type') || '';
  if (type && !/^(?:text\/csv|application\/(?:csv|octet-stream)|text\/plain)(?:;|$)/i.test(type)) throw new Error('Unsupported snapshot response');
  if (!response.body?.getReader) throw new Error('Missing snapshot body');
  const reader = response.body.getReader(), chunks = [];
  let lengthRead = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      lengthRead += value.byteLength;
      if (lengthRead > MAX_BYTES) throw new Error('Snapshot too large');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(lengthRead);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
function parseSeries(csv, series, now) {
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headings = lines.shift()?.trim().split(',');
  if (!headings || headings.length !== 2 || !['observation_date', 'DATE'].includes(headings[0]) || headings[1] !== series.id) return null;
  const today = new Date(now).toISOString().slice(0, 10), observations = new Map();
  for (const line of lines) {
    const fields = line.trim().split(',');
    if (fields.length !== 2) return null;
    const [date, raw] = fields;
    if (!validDate(date)) return null;
    if (date > today) continue;
    if (!raw || raw === '.') continue;
    if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || (series.kind === 'index' && value <= 0)) return null;
    if (observations.has(date) && observations.get(date) !== value) return null;
    observations.set(date, value);
  }
  const rows = [...observations.entries()].sort(([a], [b]) => a.localeCompare(b));
  const latest = rows.at(-1), previous = rows.at(-2);
  if (!latest || now - Date.parse(`${latest[0]}T00:00:00Z`) > series.maxAgeDays * DAY) return null;
  const isYield = series.kind === 'yield';
  const changePercent = !isYield && previous ? (latest[1] / previous[1] - 1) * 100 : null;
  const basisPointChange = isYield && previous ? Number(((latest[1] - previous[1]) * 100).toFixed(6)) : null;
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = number => `${number > 0 ? '+' : number < 0 ? '−' : ''}${formatted.format(Math.abs(number))}`;
  return {
    symbol: series.symbol, label: series.label, value: latest[1],
    changePercent, basisPointChange,
    unit: isYield ? '%' : 'index',
    changeLabel: isYield ? 'basis points' : '%',
    displayValue: `${formatted.format(latest[1])}${isYield ? '%' : ''}`,
    displayChange: isYield
      ? (basisPointChange === null ? null : `${basisPointChange > 0 ? '+' : basisPointChange < 0 ? '−' : ''}${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Math.abs(basisPointChange))} bps`)
      : (changePercent === null ? null : `${signed(changePercent)}%`),
    asOf: latest[0],
    ...SOURCE,
    sourceUrl: `${ORIGIN}/series/${series.id}`,
    delayLabel: isYield ? 'Daily observation' : 'Daily observation · delayed release',
    ...(isYield ? {} : { unitLabel: 'Index, Jan 2006 = 100' }),
  };
}
async function fetchSeries(series, fetcher, now) {
  const start = new Date(now - 30 * DAY).toISOString().slice(0, 10);
  const end = new Date(now).toISOString().slice(0, 10);
  const url = new URL('/graph/fredgraph.csv', ORIGIN);
  url.searchParams.set('id', series.id); url.searchParams.set('cosd', start); url.searchParams.set('coed', end);
  try {
    const response = await fetcher(url.href, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { Accept: 'text/csv, application/csv;q=0.9', 'User-Agent': 'Digivated-News/1.0 (+https://digivated.com/news)' },
    });
    if (!response.ok) return null;
    if (response.url && new URL(response.url).origin !== ORIGIN) return null;
    return parseSeries(await boundedCsv(response), series, now);
  } catch { return null; }
}
export async function fetchMarketSnapshot({ fetcher = fetch, now = Date.now() } = {}) {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) return unavailable();
  const results = await Promise.all(SERIES.map(series => fetchSeries(series, fetcher, now)));
  const items = results.filter(Boolean);
  if (!items.length) return unavailable();
  return { status: items.length === SERIES.length ? 'ok' : 'partial', items, updatedAt: new Date(now).toISOString(), ...SOURCE };
}
