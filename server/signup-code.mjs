import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { renderEmail, sendEmail } from './email-layout.mjs';

// Some inboxes accept mail late, so a code stays valid for 30 minutes. Any of the
// last few codes sent to the same email works: people tap "resend" while the first
// email is still on its way, and whichever email arrives first should still work.
export const codeLifetime = 1800;
export const recentCodes = 5;
// KEYS: code keys to check, the one the page asked about first. ARGV: the matching digests.
// A match uses up that code. A miss counts one wrong attempt on every code checked,
// so trying several codes at once never buys extra guesses.
export const claimCode = `
for i, key in ipairs(KEYS) do
  local digest = redis.call('HGET', key, 'digest')
  if digest and digest == ARGV[i] then
    redis.call('DEL', key)
    return 1
  end
end
for _, key in ipairs(KEYS) do
  if redis.call('EXISTS', key) == 1 and redis.call('HINCRBY', key, 'attempts', 1) >= 5 then redis.call('DEL', key) end
end
return 0
`;
export const storeCode = `
redis.call('HSET', KEYS[1], 'digest', ARGV[1], 'attempts', 0)
redis.call('EXPIRE', KEYS[1], ARGV[2])
redis.call('LREM', KEYS[2], 0, ARGV[3])
redis.call('LPUSH', KEYS[2], ARGV[3])
redis.call('LTRIM', KEYS[2], 0, tonumber(ARGV[4]) - 1)
return redis.call('EXPIRE', KEYS[2], ARGV[2])
`;
const incrementLimit = `
local attempts = redis.call('INCR', KEYS[1])
if attempts == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return attempts
`;

export async function handleSignup({ body, ip, env, redis, fetcher, createUser, send }) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return send(400, { error: 'Enter a valid email address.' });
  }
  const digest = (...parts) => createHmac('sha256', env.SUBMISSIONS_REDIS_REST_TOKEN).update(JSON.stringify(parts)).digest('hex');

  if (body.challenge !== undefined || body.code !== undefined) {
    const { challenge, code, password } = body;
    if (typeof challenge !== 'string' || !/^[a-f0-9]{48}$/.test(challenge) ||
        typeof code !== 'string' || !/^\d{6}$/.test(code) ||
        typeof password !== 'string' || password.length < 10 || password.length > 128) {
      return send(400, { error: 'Enter the six-digit code and a password of 10–128 characters.' });
    }
    const recentKey = 'digivated:signup:recent:' + digest(email);
    const recent = await redis(['LRANGE', recentKey, 0, recentCodes - 1]).catch(() => []);
    const challenges = [challenge, ...(Array.isArray(recent) ? recent : []).filter(item => typeof item === 'string' && /^[a-f0-9]{48}$/.test(item) && item !== challenge)].slice(0, recentCodes + 1);
    const keys = challenges.map(item => 'digivated:signup:code:' + item);
    const accepted = await redis(['EVAL', claimCode, keys.length, ...keys, ...challenges.map(item => digest(email, item, code))]);
    if (accepted !== 1) return send(400, { error: 'That code is incorrect or expired. Try again or request a new code.' });
    // One code worked, so the others sent to this email are no longer needed.
    await redis(['DEL', recentKey, ...keys]).catch(() => {});

    const { data, error } = await createUser({ email, password, email_confirm: true });
    if (error?.code === 'email_exists' || error?.code === 'user_already_exists') {
      return send(409, { error: 'This email already has an account. Sign in or reset your password.' });
    }
    if (error?.code === 'weak_password') return send(400, { error: 'Choose a stronger password and request a new code.' });
    if (error || !data?.user?.id) return send(503, { error: 'Your account could not be created. Please request a new code and try again.' });
    return send(201, { ok: true });
  }

  const mailEnv = { RESEND_API_KEY: env.SIGNUP_RESEND_API_KEY, ACCOUNT_EMAIL_FROM: env.SIGNUP_EMAIL_FROM };
  if (!mailEnv.RESEND_API_KEY || !mailEnv.ACCOUNT_EMAIL_FROM) {
    return send(503, { error: 'Verification email is temporarily unavailable.' });
  }
  const ipAttempts = await redis(['EVAL', incrementLimit, 1, 'digivated:signup:ip:' + digest(ip), '3600']);
  if (ipAttempts > 12) return send(429, { error: 'Too many code requests. Try again later.' });
  const cooldown = await redis(['SET', 'digivated:signup:cooldown:' + digest(email), '1', 'EX', '60', 'NX']);
  if (!cooldown) return send(429, { error: 'Wait a minute before requesting another code.' });
  const emailAttempts = await redis(['EVAL', incrementLimit, 1, 'digivated:signup:email:' + digest(email), '3600']);
  if (emailAttempts > 5) return send(429, { error: 'Too many code requests. Try again later.' });

  const challenge = randomBytes(24).toString('hex');
  const code = String(randomInt(100000, 1000000));
  const key = 'digivated:signup:code:' + challenge;
  const recentKey = 'digivated:signup:recent:' + digest(email);
  await redis(['EVAL', storeCode, 2, key, recentKey, digest(email, challenge, code), String(codeLifetime), challenge, String(recentCodes)]);
  const message = renderEmail({
    label: 'DIGIVATED / ACCOUNT',
    title: 'Verify your email.',
    preheader: 'Enter the code on Digivated to finish signing up.',
    paragraphs: [`Your Digivated verification code is ${code}.`, 'Enter it on the signup page within 30 minutes. If you asked for more than one code, any of the latest ones works.'],
    after: ['If you didn’t request this code, you can ignore this email.'],
  });
  const delivered = await sendEmail(mailEnv, fetcher, { ...message, to: email, subject: 'Your Digivated verification code', idempotencyKey: 'signup-' + challenge }).catch(() => false);
  if (!delivered) {
    await redis(['DEL', key]);
    await redis(['LREM', recentKey, 0, challenge]).catch(() => {});
    return send(503, { error: 'We couldn’t send your code. Please try again in a minute.' });
  }
  return send(202, { challenge });
}
