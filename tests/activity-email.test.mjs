import test from 'node:test';
import assert from 'node:assert/strict';
import { sendActivityEmail } from '../server/activity-email.mjs';

const env = { SIGNUP_RESEND_API_KEY: 'fixture', SIGNUP_EMAIL_FROM: 'Digivated <accounts@auth.example.com>' };
const account = email_confirmed_at => ({ auth: { admin: { getUserById: async () => ({
  data: { user: { email: 'member@example.com', email_confirmed_at } },
}) } } });
const item = { id: 'item-id', recipientId: 'member-id', excerpt: 'private text', href: '/inbox?id=private' };

test('all six activity email categories omit private content and use a stable provider key', async () => {
  for (const type of ['reply', 'follow', 'message', 'feedback', 'upvote', 'launch']) {
    const result = await sendActivityEmail(async command => {
      assert.deepEqual(command.slice(-2), [20, 6]);
      return 1;
    }, { ...item, type }, {
      env, accountClient: account('2026-11-20T00:00:00Z'),
      fetcher: async (url, request) => {
        assert.equal(url, 'https://api.resend.com/emails');
        assert.equal(request.headers['Idempotency-Key'], 'activity-item-id');
        const message = JSON.parse(request.body);
        assert.deepEqual(message.to, ['member@example.com']);
        assert.equal(message.from, env.SIGNUP_EMAIL_FROM);
        assert.match(message.text, /https:\/\/digivated\.com\/notifications/);
        assert.doesNotMatch(request.body, /private text|inbox\?id=private/);
        return { ok: true };
      },
    });
    assert.equal(result, 'sent', type);
  }
});

test('limits and unconfirmed addresses skip provider delivery', async () => {
  let attempted = false;
  const options = { env, accountClient: account(null), fetcher: async () => { attempted = true; } };
  assert.equal(await sendActivityEmail(async () => 0, { ...item, type: 'reply' }, options), 'limited');
  assert.equal(await sendActivityEmail(async () => 1, { ...item, type: 'reply' }, options), 'skipped');
  assert.equal(await sendActivityEmail(async () => 1, { ...item, type: 'award' }, options), 'skipped');
  assert.equal(attempted, false);
});

test('provider errors stay isolated from the notification request', async () => {
  const result = await sendActivityEmail(async () => 1, { ...item, type: 'message' }, {
    env, accountClient: account('2026-11-20T00:00:00Z'), fetcher: async () => { throw Error('network failure'); },
  });
  assert.equal(result, 'failed');
});

test('activity alerts prefer the site sender and fall back to the sign-in sender', async () => {
  const sent = [];
  const fetcher = async (url, init) => { if (String(url).includes('resend')) { sent.push(JSON.parse(init.body)); return new Response('{"id":"x"}', { status: 200 }); } return new Response('{}', { status: 200 }); };
  const accountClient = { auth: { admin: { getUserById: async () => ({ data: { user: { email: 'maker@example.com', email_confirmed_at: '2026-11-01T00:00:00Z' } } }) } } };
  const redis = async () => 1;
  const item = { id: '11111111-1111-4111-8111-111111111111', recipientId: '22222222-2222-4222-8222-222222222222', type: 'reply' };
  const site = { ...env, RESEND_API_KEY: 'site-fixture', ACCOUNT_EMAIL_FROM: 'Digivated <updates@example.com>' };
  assert.equal(await sendActivityEmail(redis, item, { env: site, fetcher, accountClient }), 'sent');
  assert.equal(sent.at(-1).from, 'Digivated <updates@example.com>');
  assert.equal(await sendActivityEmail(redis, { ...item, id: '33333333-3333-4333-8333-333333333333' }, { env, fetcher, accountClient }), 'sent');
  assert.equal(sent.at(-1).from, env.SIGNUP_EMAIL_FROM);
});
