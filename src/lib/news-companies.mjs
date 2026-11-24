// Spots well-known public companies in News headlines and summaries, so the
// sidebar can show which stocks are in the news. Names are matched whole and
// case-sensitive, and words that are also everyday English (Block, Target, Arm,
// Visa, Snap, X) are left out so a plain sentence never turns into a ticker.
export const NEWS_COMPANIES = [
  ['AAPL', 'NASDAQ', 'Apple', ['Apple']],
  ['MSFT', 'NASDAQ', 'Microsoft', ['Microsoft']],
  ['GOOGL', 'NASDAQ', 'Alphabet', ['Alphabet', 'Google']],
  ['AMZN', 'NASDAQ', 'Amazon', ['Amazon', 'AWS']],
  ['META', 'NASDAQ', 'Meta', ['Meta', 'Facebook', 'Instagram', 'WhatsApp']],
  ['NVDA', 'NASDAQ', 'Nvidia', ['Nvidia', 'NVIDIA']],
  ['TSLA', 'NASDAQ', 'Tesla', ['Tesla']],
  ['NFLX', 'NASDAQ', 'Netflix', ['Netflix']],
  ['AVGO', 'NASDAQ', 'Broadcom', ['Broadcom', 'VMware']],
  ['AMD', 'NASDAQ', 'AMD', ['AMD']],
  ['INTC', 'NASDAQ', 'Intel', ['Intel']],
  ['QCOM', 'NASDAQ', 'Qualcomm', ['Qualcomm']],
  ['MU', 'NASDAQ', 'Micron', ['Micron']],
  ['TSM', 'NYSE', 'TSMC', ['TSMC']],
  ['CSCO', 'NASDAQ', 'Cisco', ['Cisco']],
  ['ORCL', 'NYSE', 'Oracle', ['Oracle']],
  ['IBM', 'NYSE', 'IBM', ['IBM']],
  ['CRM', 'NYSE', 'Salesforce', ['Salesforce', 'Slack']],
  ['ADBE', 'NASDAQ', 'Adobe', ['Adobe']],
  ['NOW', 'NYSE', 'ServiceNow', ['ServiceNow']],
  ['INTU', 'NASDAQ', 'Intuit', ['Intuit']],
  ['SAP', 'NYSE', 'SAP', ['SAP']],
  ['PLTR', 'NASDAQ', 'Palantir', ['Palantir']],
  ['SNOW', 'NYSE', 'Snowflake', ['Snowflake']],
  ['DDOG', 'NASDAQ', 'Datadog', ['Datadog']],
  ['MDB', 'NASDAQ', 'MongoDB', ['MongoDB']],
  ['NET', 'NYSE', 'Cloudflare', ['Cloudflare']],
  ['CRWD', 'NASDAQ', 'CrowdStrike', ['CrowdStrike']],
  ['PANW', 'NASDAQ', 'Palo Alto Networks', ['Palo Alto Networks']],
  ['FTNT', 'NASDAQ', 'Fortinet', ['Fortinet', 'FortiGate', 'FortiOS']],
  ['ZS', 'NASDAQ', 'Zscaler', ['Zscaler']],
  ['OKTA', 'NASDAQ', 'Okta', ['Okta']],
  ['S', 'NYSE', 'SentinelOne', ['SentinelOne']],
  ['CHKP', 'NASDAQ', 'Check Point', ['Check Point']],
  ['DELL', 'NYSE', 'Dell', ['Dell']],
  ['HPE', 'NYSE', 'HPE', ['Hewlett Packard Enterprise', 'HPE']],
  ['SMCI', 'NASDAQ', 'Supermicro', ['Supermicro', 'Super Micro']],
  ['ARM', 'NASDAQ', 'Arm Holdings', ['Arm Holdings']],
  ['SHOP', 'NYSE', 'Shopify', ['Shopify']],
  ['UBER', 'NYSE', 'Uber', ['Uber']],
  ['ABNB', 'NASDAQ', 'Airbnb', ['Airbnb']],
  ['SPOT', 'NYSE', 'Spotify', ['Spotify']],
  ['RDDT', 'NYSE', 'Reddit', ['Reddit']],
  ['PINS', 'NYSE', 'Pinterest', ['Pinterest']],
  ['COIN', 'NASDAQ', 'Coinbase', ['Coinbase']],
  ['HOOD', 'NASDAQ', 'Robinhood', ['Robinhood']],
  ['PYPL', 'NASDAQ', 'PayPal', ['PayPal']],
  ['MA', 'NYSE', 'Mastercard', ['Mastercard']],
  ['JPM', 'NYSE', 'JPMorgan', ['JPMorgan', 'JP Morgan']],
  ['GS', 'NYSE', 'Goldman Sachs', ['Goldman Sachs']],
  ['BAC', 'NYSE', 'Bank of America', ['Bank of America']],
  ['DIS', 'NYSE', 'Disney', ['Disney']],
  ['SONY', 'NYSE', 'Sony', ['Sony']],
  ['T', 'NYSE', 'AT&T', ['AT&T']],
  ['VZ', 'NYSE', 'Verizon', ['Verizon']],
  ['TMUS', 'NASDAQ', 'T-Mobile', ['T-Mobile']],
  ['CMCSA', 'NASDAQ', 'Comcast', ['Comcast']],
  ['WMT', 'NYSE', 'Walmart', ['Walmart']],
  ['BA', 'NYSE', 'Boeing', ['Boeing']],
  ['F', 'NYSE', 'Ford', ['Ford Motor']],
  ['GM', 'NYSE', 'General Motors', ['General Motors']],
  ['RIVN', 'NASDAQ', 'Rivian', ['Rivian']],
];

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = NEWS_COMPANIES.map(([symbol, exchange, name, names]) => ({
  symbol, exchange, name,
  pattern: new RegExp(`(?<![\\w-])(?:${names.map(escape).join('|')})(?![\\w-])`),
}));

// Companies a story is about: tickers the pipeline already attached, then names in the text.
export function storyCompanies(story) {
  const found = new Map();
  for (const t of Array.isArray(story?.tickers) ? story.tickers : []) {
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(t?.symbol || '') || !/^[A-Z]+$/.test(t?.exchange || '')) continue;
    const known = NEWS_COMPANIES.find(([symbol]) => symbol === t.symbol);
    found.set(t.symbol, { symbol:t.symbol, exchange:t.exchange, name:known?.[2] || t.symbol });
  }
  const text = `${story?.headline || ''}\n${story?.summary || ''}`;
  for (const company of PATTERNS) {
    if (!found.has(company.symbol) && company.pattern.test(text)) found.set(company.symbol, { symbol:company.symbol, exchange:company.exchange, name:company.name });
  }
  return [...found.values()];
}

export const validStockSymbol = value => /^[A-Z][A-Z0-9.-]{0,11}$/.test(String(value || ''));

// True when a story is about the company with this ticker.
export function storyMentions(story, symbol) {
  return validStockSymbol(symbol) && storyCompanies(story).some(company => company.symbol === symbol);
}

// Most-mentioned companies across recent stories. A headline mention counts double.
// Each entry carries its latest headlines, mentions per day (oldest day first) and
// the topic most of its stories fall under.
export function stocksInTheNews(stories, { now = Date.now(), hours = 72, limit = 6 } = {}) {
  const tally = new Map(), days = Math.max(1, Math.ceil(hours / 24));
  for (const story of stories) {
    const published = Date.parse(story?.sourcePublishedAt);
    if (!Number.isFinite(published) || published > now + 300000 || now - published > hours * 3600000) continue;
    for (const company of storyCompanies(story)) {
      const entry = tally.get(company.symbol) || { ...company, stories:0, score:0, latestAt:0, buzz:Array(days).fill(0), topics:{}, list:[] };
      const inHeadline = PATTERNS.find(p => p.symbol === company.symbol)?.pattern.test(story.headline || '');
      entry.stories += 1;
      entry.score += inHeadline ? 2 : 1;
      entry.latestAt = Math.max(entry.latestAt, published);
      const age = Math.min(days - 1, Math.max(0, Math.floor((now - published) / 86400000)));
      entry.buzz[days - 1 - age] += 1;
      if (story.category) entry.topics[story.category] = (entry.topics[story.category] || 0) + 1;
      entry.list.push({ id:story.id, headline:story.headline, category:story.category, sourceName:story.sourceName || '', at:published });
      tally.set(company.symbol, entry);
    }
  }
  return [...tally.values()]
    .sort((a, b) => b.score - a.score || b.latestAt - a.latestAt || a.symbol.localeCompare(b.symbol))
    .slice(0, limit)
    .map(({ symbol, exchange, name, stories, score, buzz, topics, list }) => {
      const headlines = list.sort((a, b) => b.at - a.at).slice(0, 4).map(({ id, headline, category, sourceName }) => ({ id, headline, category, sourceName }));
      const topic = Object.entries(topics).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      return { symbol, exchange, name, stories, score, buzz, topic, headlines, latest: headlines[0] ? { id:headlines[0].id, headline:headlines[0].headline } : null };
    });
}
