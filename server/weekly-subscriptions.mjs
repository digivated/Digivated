import { createHmac } from 'node:crypto';

export const weeklyMembers = 'digivated:weekly:members';
export const weeklyPreference = id => `digivated:weekly:preference:${id}`;
export const emailSubscriberId = (email, secret) =>
  'email-' + createHmac('sha256', secret).update(`weekly-email:${email.trim().toLowerCase()}`).digest('hex');
export const isEmailSubscriber = id => /^email-[a-f0-9]{64}$/.test(id);
export const weeklyOptOut = id => `digivated:weekly:opt-out:${id}`;

const REMOVE = `
if ARGV[3] == 'yes' then
  redis.call('SET',KEYS[3],'1')
  redis.call('DEL',KEYS[4])
  redis.call('ZREM',KEYS[2],ARGV[2])
end
redis.call('DEL',KEYS[1])
redis.call('ZREM',KEYS[2],ARGV[1])
return 1
`;

export async function stopWeeklyEmail(redis, id, emailId) {
  const target = emailId || id;
  await redis(['EVAL', REMOVE, 4, weeklyPreference(id), weeklyMembers, weeklyOptOut(target),
    weeklyPreference(target), id, target, emailId ? 'yes' : 'no']);
}
