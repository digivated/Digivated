import { createClient } from '@supabase/supabase-js';
import { renderEmail, sendEmail } from './email-layout.mjs';

const notificationsUrl = 'https://digivated.com/notifications';
const emailTitles = Object.freeze({
  reply: 'You have a new reply',
  follow: 'You have a new follower',
  message: 'You have a new message',
  feedback: 'Your project received feedback',
  upvote: 'You received an upvote',
  launch: 'A launch you follow is live',
});

// Reserve both budgets atomically. Other email flows share the provider quota.
const reserve = `
  if tonumber(redis.call('GET', KEYS[1]) or '0') >= tonumber(ARGV[1])
     or tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[2]) then return 0 end
  for _, key in ipairs(KEYS) do
    if redis.call('INCR', key) == 1 then redis.call('EXPIRE', key, 172800) end
  end
  return 1
`;

export async function sendActivityEmail(redis, item, {
  env = process.env, fetcher = fetch, accountClient, now = Date.now(),
} = {}) {
  if (!Object.hasOwn(emailTitles, item.type)) return 'skipped';
  const mailEnv = { RESEND_API_KEY: env.SIGNUP_RESEND_API_KEY, ACCOUNT_EMAIL_FROM: env.SIGNUP_EMAIL_FROM };
  if (!mailEnv.RESEND_API_KEY || !mailEnv.ACCOUNT_EMAIL_FROM ||
      (!accountClient && (!env.COMMUNITY_SUPABASE_URL || !env.COMMUNITY_SUPABASE_SECRET_KEY))) return 'unavailable';

  try {
    const day = new Date(now).toISOString().slice(0, 10);
    const budget = await redis(['EVAL', reserve, 2, `digivated:activity-email:day:${day}`,
      `digivated:activity-email:member:${day}:${item.recipientId}`, 20, 6]);
    if (Number(budget) !== 1) return 'limited';
    const signal = AbortSignal.timeout(4500);
    const boundedFetch = (input, init) => fetcher(input, { ...init, signal });
    const client = accountClient || createClient(env.COMMUNITY_SUPABASE_URL, env.COMMUNITY_SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch: boundedFetch },
    });
    const { data, error } = await client.auth.admin.getUserById(item.recipientId);
    if (error) return 'failed';
    const user = data?.user;
    if (!user?.email_confirmed_at || !user.email) return 'skipped';

    const title = emailTitles[item.type];
    const message = renderEmail({
      label: 'DIGIVATED / ACTIVITY',
      title,
      paragraphs: ['Sign in to Digivated to see the activity.'],
      cta: { label: 'Open Notifications', href: notificationsUrl },
      footer: [{ label: 'Manage activity emails', href: `${notificationsUrl}#notification-preferences` }],
    });
    return await sendEmail(mailEnv, boundedFetch, {
      ...message, to: user.email, subject: `${title} on Digivated`, idempotencyKey: `activity-${item.id}`,
    }) ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
