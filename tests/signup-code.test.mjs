import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSignup, claimCode, storeCode, codeLifetime } from '../server/signup-code.mjs';

// A small in-memory Redis that runs the same steps as the two Lua scripts.
function fakeRedis() {
  const hashes = new Map(), lists = new Map(), strings = new Map(), ttl = new Map();
  const redis = async ([command, ...args]) => {
    if (command === 'EVAL') {
      const [script, count, ...rest] = args;
      const keys = rest.slice(0, Number(count)), argv = rest.slice(Number(count));
      if (script === storeCode) {
        const [codeKey, recentKey] = keys, [digest, life, challenge, max] = argv;
        hashes.set(codeKey, { digest, attempts: 0 }); ttl.set(codeKey, Number(life));
        const list = (lists.get(recentKey) || []).filter(item => item !== challenge);
        list.unshift(challenge); lists.set(recentKey, list.slice(0, Number(max))); ttl.set(recentKey, Number(life));
        return 1;
      }
      if (script === claimCode) {
        for (const [i, key] of keys.entries()) {
          const entry = hashes.get(key);
          if (entry && entry.digest === argv[i]) { hashes.delete(key); return 1; }
        }
        for (const key of keys) {
          const entry = hashes.get(key);
          if (entry && ++entry.attempts >= 5) hashes.delete(key);
        }
        return 0;
      }
      // Rate limit counter.
      const key = keys[0]; const next = (Number(strings.get(key)) || 0) + 1; strings.set(key, next); return next;
    }
    if (command === 'SET') { if (args.includes('NX') && strings.has(args[0])) return null; strings.set(args[0], args[1]); return 'OK'; }
    if (command === 'LRANGE') return (lists.get(args[0]) || []).slice(Number(args[1]), Number(args[2]) + 1);
    if (command === 'LREM') { lists.set(args[0], (lists.get(args[0]) || []).filter(item => item !== args[2])); return 1; }
    if (command === 'DEL') { for (const key of args) { hashes.delete(key); lists.delete(key); strings.delete(key); } return 1; }
    throw Error('Unexpected command ' + command);
  };
  return { redis, hashes, lists, strings, ttl };
}

function harness() {
  const store = fakeRedis(), sent = [], created = [];
  const env = { SUBMISSIONS_REDIS_REST_TOKEN: 'secret', SIGNUP_RESEND_API_KEY: 're_test', SIGNUP_EMAIL_FROM: 'Digivated <accounts@digivated.com>' };
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    return new Response(JSON.stringify({ id: 'email_' + sent.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const createUser = async user => { created.push(user); return { data: { user: { id: 'user_' + created.length } }, error: null }; };
  const call = async body => {
    let result;
    await handleSignup({ body, ip: '203.0.113.9', env, redis: store.redis, fetcher, createUser, send: (status, data) => { result = { status, data }; } });
    return result;
  };
  const codeFrom = message => /verification code is (\d{6})/.exec(message.html || message.text || '')?.[1];
  return { store, sent, created, call, codeFrom };
}

test('codes last 30 minutes', async () => {
  const h = harness();
  const first = await h.call({ email: 'maker@example.com' });
  assert.equal(first.status, 202);
  assert.equal(codeLifetime, 1800);
  assert.equal(h.store.ttl.get('digivated:signup:code:' + first.data.challenge), 1800);
  assert.match(h.sent[0].html || h.sent[0].text, /30 minutes/);
});

test('an earlier code still works after the person asked for a new one', async () => {
  const h = harness();
  const first = await h.call({ email: 'maker@example.com' });
  const firstCode = h.codeFrom(h.sent[0]);
  h.store.strings.clear(); // skip the one-minute resend cooldown
  const second = await h.call({ email: 'maker@example.com' });
  assert.notEqual(second.data.challenge, first.data.challenge);
  // The page only remembers the newest request, but the first email's code arrives first.
  const result = await h.call({ email: 'maker@example.com', challenge: second.data.challenge, code: firstCode, password: 'a-strong-password' });
  assert.equal(result.status, 201);
  assert.equal(h.created.length, 1);
  // Every other code for that email is retired once one works.
  assert.equal(h.store.hashes.size, 0);
});

test('a wrong code is still rejected and guesses stay limited', async () => {
  const h = harness();
  const first = await h.call({ email: 'maker@example.com' });
  const real = h.codeFrom(h.sent[0]);
  const wrong = real === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++) {
    const result = await h.call({ email: 'maker@example.com', challenge: first.data.challenge, code: wrong, password: 'a-strong-password' });
    assert.equal(result.status, 400);
  }
  // After five misses the code is gone, even the right one fails.
  const late = await h.call({ email: 'maker@example.com', challenge: first.data.challenge, code: real, password: 'a-strong-password' });
  assert.equal(late.status, 400);
  assert.equal(h.created.length, 0);
});

test('a code sent to one email never works for another', async () => {
  const h = harness();
  await h.call({ email: 'maker@example.com' });
  const code = h.codeFrom(h.sent[0]);
  h.store.strings.clear();
  const other = await h.call({ email: 'someone@example.com' });
  const result = await h.call({ email: 'someone@example.com', challenge: other.data.challenge, code, password: 'a-strong-password' });
  if (code !== h.codeFrom(h.sent[1])) assert.equal(result.status, 400);
});
