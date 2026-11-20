import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { renderEmail, sendEmail } from './email-layout.mjs';

const codeLifetime = 600;
const claimCode = `
local digest = redis.call('HGET', KEYS[1], 'digest')
if not digest then return 0 end
if digest == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
end
if redis.call('HINCRBY', KEYS[1], 'attempts', 1) >= 5 then redis.call('DEL', KEYS[1]) end
return 0
`;
const storeCode = `
redis.call('HSET', KEYS[1], 'digest', ARGV[1], 'attempts', 0)
return redis.call('EXPIRE', KEYS[1], ARGV[2])
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
    const key = 'digivated:signup:code:' + challenge;
    const accepted = await redis(['EVAL', claimCode, 1, key, digest(email, challenge, code)]);
    if (accepted !== 1) return send(400, { error: 'That code is incorrect or expired. Try again or request a new code.' });

    const { data, error } = await createUser({ email, password, email_confirm: true });
    if (error?.code === 'email_exists' || error?.code === 'user_already_exists') {
      return send(409, { error: 'This email already has an account. Sign in or reset your password.' });
    }
    if (error?.code === 'weak_password') return send(400, { error: 'Choose a stronger password and request a new code.' });
    if (error || !data?.user?.id) return send(503, { error: 'Your account could not be created. Please request a new code and try again.' });
    return send(201, { ok: true });
  }

  if (!env.RESEND_API_KEY || !env.ACCOUNT_EMAIL_FROM) return send(503, { error: 'Verification email is temporarily unavailable.' });
  const ipAttempts = await redis(['EVAL', incrementLimit, 1, 'digivated:signup:ip:' + digest(ip), '3600']);
  if (ipAttempts > 12) return send(429, { error: 'Too many code requests. Try again later.' });
  const cooldown = await redis(['SET', 'digivated:signup:cooldown:' + digest(email), '1', 'EX', '60', 'NX']);
  if (!cooldown) return send(429, { error: 'Wait a minute before requesting another code.' });
  const emailAttempts = await redis(['EVAL', incrementLimit, 1, 'digivated:signup:email:' + digest(email), '3600']);
  if (emailAttempts > 5) return send(429, { error: 'Too many code requests. Try again later.' });

  const challenge = randomBytes(24).toString('hex');
  const code = String(randomInt(100000, 1000000));
  const key = 'digivated:signup:code:' + challenge;
  await redis(['EVAL', storeCode, 1, key, digest(email, challenge, code), String(codeLifetime)]);
  const message = renderEmail({
    label: 'DIGIVATED / ACCOUNT',
    title: 'Verify your email.',
    preheader: 'Enter the code on Digivated to finish signing up.',
    paragraphs: [`Your Digivated verification code is ${code}.`, 'Enter it on the signup page within 10 minutes.'],
    after: ['If you didn’t request this code, you can ignore this email.'],
  });
  const delivered = await sendEmail(env, fetcher, { ...message, to: email, subject: 'Your Digivated verification code', idempotencyKey: 'signup-' + challenge }).catch(() => false);
  if (!delivered) {
    await redis(['DEL', key]);
    return send(503, { error: 'We couldn’t send your code. Please try again in a minute.' });
  }
  return send(202, { challenge });
}
