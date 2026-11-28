import test from 'node:test';
import assert from 'node:assert/strict';
import { projectUpdate, sendProjectUpdate } from '../server/account-mail.mjs';

const previous = { id:'project-1', accountId:'account-1', email:'creator@example.com', status:'pending', reviewFeedback:'' };
const saved = { ...previous, status:'approved', revision:1, reviewFeedback:'Private owner feedback.' };

test('account project updates link to private feedback without including it in email',()=>{
  const update=projectUpdate(previous,saved);
  assert.equal(update.to,previous.email);
  assert.match(update.text,/https:\/\/digivated.com\/dashboard/);
  assert.doesNotMatch(JSON.stringify(update),/Private owner feedback/);
  assert.equal(projectUpdate(previous,{...previous,revision:1}),null);
  assert.equal(projectUpdate(previous,{...saved,accountId:null}),null);
});

test('project notifications require a configured sender and use a stable send key',async()=>{
  assert.equal(await sendProjectUpdate(previous,saved,{}),'unavailable');
  const requests=[];
  const send=async(url,options)=>{requests.push({url,options});return {ok:true};};
  const env={RESEND_API_KEY:'test-key',ACCOUNT_EMAIL_FROM:'Digivated <updates@digivated.com>'};
  const client={auth:{admin:{getUserById:async()=>({data:{user:{email:previous.email,email_confirmed_at:'2026-10-25T00:00:00Z'}},error:null})}}};
  assert.equal(await sendProjectUpdate(previous,saved,env,send,client),'sent');
  assert.equal(requests[0].url,'https://api.resend.com/emails');
  assert.equal(requests[0].options.headers['Idempotency-Key'],'digivated-project-project-1-r1');
  const body=JSON.parse(requests[0].options.body);
  assert.deepEqual(body.to,['creator@example.com']);
  assert.doesNotMatch(JSON.stringify(body),/Private owner feedback/);
  assert.equal(await sendProjectUpdate(previous,saved,env,async()=>({ok:false}),client),'failed');
  assert.equal(await sendProjectUpdate(previous,saved,env,async()=>{throw Error('provider');},client),'failed');
  const changedEmail={auth:{admin:{getUserById:async()=>({data:{user:{email:'new@example.com',email_confirmed_at:'2026-10-25T00:00:00Z'}},error:null})}}};
  assert.equal(await sendProjectUpdate(previous,saved,env,send,changedEmail),'failed');
  assert.equal(requests.length,1);
});

test('owner emails are on theme, escape project names and never carry private feedback', async () => {
  const { awardEmail, sendAwardEmail } = await import('../server/account-mail.mjs');
  const named = { ...saved, name: 'Pocket <script>alert(1)</script>' };
  const live = projectUpdate(previous, named);
  assert.match(live.subject, /is live on Digivated/);
  assert.match(live.html, /\[ DIGIVATED \/ LIVE \]/);
  assert.match(live.html, /projects\/listing\/project-1/);
  assert.doesNotMatch(live.html, /<script>alert/);
  assert.match(live.html, /&lt;script&gt;/);
  assert.match(live.text, /View your listing: https:\/\/digivated.com\/projects\/listing\/project-1/);
  for (const message of [live, projectUpdate(previous, { ...previous, revision: 2, reviewFeedback: 'Secret note' })]) {
    assert.doesNotMatch(message.html + message.text, /Private owner feedback|Secret note/);
  }
  const award = awardEmail(named, 2, '2026-11-09T00:00:00.000Z');
  assert.match(award.subject, /placed #2 this week/);
  assert.match(award.html, /WEEKLY PODIUM/);
  assert.equal(award.idempotencyKey, 'digivated-award-project-1-2026-11-09');
  assert.equal(awardEmail(named, 4, '2026-11-09T00:00:00.000Z'), null);
  const requests = [];
  const env = { RESEND_API_KEY: 'k', ACCOUNT_EMAIL_FROM: 'Digivated <updates@digivated.com>' };
  const client = { auth: { admin: { getUserById: async () => ({ data: { user: { email: previous.email, email_confirmed_at: '2026-10-25T00:00:00Z' } }, error: null }) } } };
  assert.equal(await sendAwardEmail(named, 1, '2026-11-09T00:00:00.000Z', env, async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true }; }, client), 'sent');
  assert.ok(requests[0].html && requests[0].text, 'every email has an HTML and a plain-text version');
});

test('missing-badge reminders give an AI prompt and use the verified transactional sender', async () => {
  const { badgeEmail, sendBadgeEmail } = await import('../server/account-mail.mjs');
  const record = { ...previous, name: 'Example', url: 'https://example.com', launch: { scheduledAt: '2026-11-23T14:00:00Z' } };
  const env = {
    RESEND_API_KEY: 'original-key', ACCOUNT_EMAIL_FROM: 'original@example.com',
    SIGNUP_RESEND_API_KEY: 'transactional-key', SIGNUP_EMAIL_FROM: 'accounts@auth.example.com',
  };
  const client = { auth: { admin: { getUserById: async () => ({ data: { user: { email: record.email, email_confirmed_at: '2026-10-25T00:00:00Z' } }, error: null }) } } };
  for (const stage of ['finish', 'nudge', 'last-call']) {
    const message = badgeEmail(record, stage);
    assert.match(message.text, /automatically every 15 minutes/);
    assert.match(message.text, /Add this exact HTML to my homepage footer/);
    assert.match(message.text, /dashboard#project-project-1/);
  }
  for (const [stage, from] of [['finish', env.SIGNUP_EMAIL_FROM], ['verified', env.ACCOUNT_EMAIL_FROM]]) {
    const sent = await sendBadgeEmail(record, stage, env, async (_url, request) => {
      assert.equal(JSON.parse(request.body).from, from);
      return { ok: true };
    }, client);
    assert.equal(sent, 'sent');
  }
});
