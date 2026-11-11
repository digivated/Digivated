import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { adminAnalytics } from '../server/admin-analytics.mjs';
import { makeAdminHandler } from '../server/admin-handler.mjs';
import { passwordHash } from '../server/admin-auth.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { GA4_PROPERTY_ID: '123', GA4_CLIENT_EMAIL: 'viewer@example.test', GA4_PRIVATE_KEY: privateKey.export({type:'pkcs8',format:'pem'}) };
const report = rows => ({ rows });
const item = (label, values) => ({ dimensionValues: [{value:label}], metricValues: values.map(value => ({value:String(value)})) });

test('owner analytics returns only aggregated GA4 metrics and product events', async () => {
  let request;
  const fetcher = async (url, options) => {
    if (url.includes('oauth2')) return {ok:true,json:async()=>({access_token:'fixture'})};
    request = JSON.parse(options.body);
    return {ok:true,json:async()=>({reports:[
      report([{metricValues:[{value:'120'},{value:'180'},{value:'470'}]}]),
      report([item('20261110',[15,23])]),
      report([item('google / organic',[52])]),
      report([item('/discover',[88])]),
      report([item('project_open',[25]),item('membership_checkout',[4])]),
    ]})};
  };
  const data = await adminAnalytics({env,fetcher,now:new Date('2026-11-11T12:00:00Z')});
  assert.equal(data.status,'ready');
  assert.deepEqual(data.totals,{activeUsers:120,sessions:180,pageViews:470});
  assert.deepEqual(data.actions,[{name:'project_open',count:25},{name:'membership_checkout',count:4}]);
  assert.deepEqual(data.sources,[{label:'google / organic',sessions:52}]);
  assert.equal(request.requests.length,5);
  assert.deepEqual(request.requests[4].dimensionFilter.filter.inListFilter.values.includes('project_submit'),true);
  assert(!JSON.stringify(data).includes('viewer@example.test'));
});

test('missing or denied GA4 reporting never produces fabricated zero totals', async () => {
  assert.deepEqual(await adminAnalytics({env:{},fetcher:()=>{throw Error('Unexpected request');}}),{status:'unconfigured'});
  const data=await adminAnalytics({env,fetcher:async url=>url.includes('oauth2')?{ok:true,json:async()=>({access_token:'fixture'})}:{ok:false,status:403}});
  assert.deepEqual(data,{status:'unavailable'});
});

test('analytics endpoint requires the owner session', async () => {
  const authEnv={DIGIVATED_ADMIN_PASSWORD_HASH:await passwordHash('Owner fixture password!'),DIGIVATED_ADMIN_SESSION_SECRET:'a'.repeat(64)};
  let status,body;
  await makeAdminHandler({env:authEnv,redis:async()=>null,adminAnalytics:()=>{throw Error('Must not run');}})(
    {method:'GET',url:'/api/admin?action=analytics',headers:{}},
    {setHeader(){},set statusCode(v){status=v},end(v){body=JSON.parse(v)}},
  );
  assert.equal(status,401);
  assert.deepEqual(Object.keys(body),['error']);
});
