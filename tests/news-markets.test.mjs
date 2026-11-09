import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMarketSnapshot } from '../server/news-markets.mjs';
const now = Date.parse('2026-11-09T15:00:00Z');
const response = body => new Response(body, { headers: { 'Content-Type': 'application/csv' } });
function fixture(rows = '2026-11-05,100\n2026-11-06,105', fail) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    const series = new URL(url).searchParams.get('id');
    if (fail === series) throw new Error('Source unavailable');
    return response(`observation_date,${series}\n${rows}\n`);
  };
  return { calls, fetcher };
}
test('snapshot attributes government daily observations and keeps retrieval time separate from their dates', async () => {
  const f = fixture(); const result = await fetchMarketSnapshot({ fetcher: f.fetcher, now });
  assert.equal(result.status, 'ok'); assert.equal(result.items.length, 3);
  assert.equal(result.updatedAt, '2026-11-09T15:00:00.000Z');
  for (const item of result.items) {
    assert.equal(item.value, 105); assert.equal(item.asOf, '2026-11-06');
    if(item.unit==='%'){assert.equal(item.changePercent,null);assert.equal(item.basisPointChange,500);assert.equal(item.displayValue,'105.00%');assert.equal(item.displayChange,'+500 bps');}
    else {assert.ok(Math.abs(item.changePercent-5)<1e-10);assert.equal(item.displayValue,'105.00');assert.equal(item.displayChange,'+5.00%');}
    assert.match(item.delayLabel, /^Daily observation/); assert.match(item.sourceUrl, /^https:\/\/fred.stlouisfed.org\/series\//);
  }
  for (const call of f.calls) {
    const url = new URL(call.url); assert.equal(url.origin, 'https://fred.stlouisfed.org');
    assert.equal(url.pathname, '/graph/fredgraph.csv'); assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.signal.aborted, false);
  }
});
test('weekends and missing observations use the prior actual close rather than zero', async () => {
  const f = fixture('2026-11-04,100\n2026-11-05,.\n2026-11-06,102');
  const result = await fetchMarketSnapshot({ fetcher: f.fetcher, now });
  assert.equal(result.items[0].value, 102); assert.equal(result.items[0].basisPointChange,200);
});
test('one valid observation has no invented percentage change', async () => {
  const f = fixture('2026-11-06,102'); const result = await fetchMarketSnapshot({ fetcher: f.fetcher, now });
  assert.equal(result.items[0].changePercent, null); assert.equal(result.items[0].displayChange, null);
});
test('partial source failure preserves independently verified series', async () => {
  const f = fixture(undefined, 'DGS10'); const result = await fetchMarketSnapshot({ fetcher: f.fetcher, now });
  assert.equal(result.status, 'partial'); assert.equal(result.items.length, 2); assert.equal(result.items.some(item => item.symbol === 'UST10Y'), false);
});
for (const [label, rows] of [
  ['stale', '2026-10-01,100\n2026-10-02,105'],
  ['future only', '2026-11-10,100\n2026-11-11,105'],
  ['invalid date', '2026-02-30,100'],
  ['conflicting duplicate dates', '2026-11-06,100\n2026-11-06,105'],
  ['invalid values', '2026-11-06,Infinity'],
]) test(label + ' observations are not presented as current market data', async () => {
  const f = fixture(rows); const result = await fetchMarketSnapshot({ fetcher: f.fetcher, now });
  assert.equal(result.status, 'unavailable'); assert.deepEqual(result.items, []); assert.equal(result.updatedAt, null);
});
test('HTML, oversized bodies, and redirects fail closed', async () => {
  for (const fetcher of [
    async () => new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }),
    async () => response('x'.repeat(66000)),
    async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }),
  ]) {
    const result = await fetchMarketSnapshot({ fetcher, now }); assert.equal(result.status, 'unavailable');
  }
});
test('a later future observation is ignored and cannot replace the latest source observation', async () => {
  const f = fixture('2026-11-05,100\n2026-11-06,105\n2026-11-10,999');
  const result = await fetchMarketSnapshot({ fetcher: f.fetcher, now });assert.equal(result.items[0].value,105);assert.equal(result.items[0].asOf,'2026-11-06');
});

test('Treasury changes are basis points rather than a misleading percent price return', async () => {
  const f=fixture('2026-11-05,4.90\n2026-11-06,4.84'); const result=await fetchMarketSnapshot({fetcher:f.fetcher,now});
  assert.equal(result.items[0].displayValue,'4.84%');assert.equal(result.items[0].basisPointChange,-6);assert.equal(result.items[0].displayChange,'−6 bps');assert.equal(result.items[0].changePercent,null);
});
test('a delayed dollar observation retains its date while expired Treasury observations are omitted', async () => {
  const f=fixture('2026-10-29,121.7361\n2026-10-30,121.6656');const result=await fetchMarketSnapshot({fetcher:f.fetcher,now});
  assert.equal(result.status,'partial');assert.equal(result.items.length,1);assert.equal(result.items[0].symbol,'USDBROAD');assert.equal(result.items[0].asOf,'2026-10-30');assert.match(result.items[0].delayLabel,/delayed/);
});
test('negative or zero government yields remain valid observations', async () => {
  const f=fixture('2026-11-05,0\n2026-11-06,-0.05');const result=await fetchMarketSnapshot({fetcher:f.fetcher,now});
  assert.equal(result.status,'partial');assert.equal(result.items.length,2);assert.equal(result.items[0].value,-0.05);assert.equal(result.items[0].basisPointChange,-5);
});
