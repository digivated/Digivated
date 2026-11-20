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
