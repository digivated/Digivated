import test from 'node:test';
import assert from 'node:assert/strict';
import { storyCompanies, stocksInTheNews } from '../src/lib/news-companies.mjs';
import { fetchMarketSnapshot } from '../server/news-markets.mjs';

const now = Date.parse('2026-11-23T20:00:00Z');
const at = hours => new Date(now - hours * 3600000).toISOString();
const story = (id, headline, summary = '', hours = 1, extra = {}) => ({ id, headline, summary, sourcePublishedAt: at(hours), ...extra });

test('named public companies become tickers', () => {
  assert.deepEqual(storyCompanies(story('a', 'CISA flags critical Cisco RCE flaw')).map(c => c.symbol), ['CSCO']);
  assert.deepEqual(storyCompanies(story('b', 'A more tailored Google Search', 'Google Wallet and Drive')).map(c => c.symbol), ['GOOGL']);
});

test('everyday words and lookalikes are not tickers', () => {
  const text = story('c', 'Meta-analysis finds a block in the target pipeline', 'apple pie, artificial intelligence, the arm of the law and a visa');
  assert.deepEqual(storyCompanies(text), []);
});

test('tickers the pipeline attached are kept', () => {
  assert.deepEqual(storyCompanies(story('d', 'Quarterly results', '', 1, { tickers: [{ exchange: 'NASDAQ', symbol: 'CSCO' }] })).map(c => c.symbol), ['CSCO']);
});

test('stocks in the news ranks by mentions, favours headlines and skips old stories', () => {
  const list = stocksInTheNews([
    story('1', 'Nvidia unveils new chips', 'Nvidia and Intel'),
    story('2', 'Nvidia leads chip stocks'),
    story('3', 'Intel cuts jobs'),
    story('4', 'Apple ships an update', '', 100),
  ], { now });
  assert.deepEqual(list.map(s => [s.symbol, s.stories]), [['NVDA', 2], ['INTC', 2]]);
  assert.equal(list[0].latest.id, '1');
  assert.equal(list.some(s => s.symbol === 'AAPL'), false);
});

test('rates keep a short history for trend lines', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')},${(4 + i / 100).toFixed(2)}`).filter(r => r < '2026-11-24').join('\n');
  const fetcher = async url => new Response(`observation_date,${new URL(url).searchParams.get('id')}\n${rows}\n`, { headers: { 'Content-Type': 'application/csv' } });
  const result = await fetchMarketSnapshot({ fetcher, now });
  assert.equal(result.items[0].history.length, 22);
  assert.equal(result.items[0].history.at(-1), result.items[0].value);
});
