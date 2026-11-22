import { freeLaunchTime } from '../src/lib/launch-calendar.mjs';
// Transactional emails to a project's owner: status changes (including going
// live from the weekly queue or Instant Publishing) and weekly podium places.
// Private review feedback is never put in an email; it stays behind sign-in.
import { createClient } from '@supabase/supabase-js';
import { renderEmail, sendEmail } from './email-layout.mjs';

const ACCOUNT = 'https://digivated.com/account';
const footer = [{ label: 'Your projects', href: ACCOUNT }, { label: 'Notification settings', href: 'https://digivated.com/notifications' }];
const listing = record => `https://digivated.com/projects/listing/${encodeURIComponent(record.id)}`;

const updates = {
  approved: record => ({
    subject: `${record.name || 'Your project'} is live on Digivated`,
    label: 'DIGIVATED / LIVE', title: 'Your project is live.',
    paragraphs: [`${record.name || 'Your project'} is now public on Digivated and in this week’s launches.`, 'Share the link with people who’d try it. Upvotes and comments this week decide the weekly podium.'],
    cta: { label: 'View your listing', href: listing(record) },
    after: ['Your dashboard shows views, visits, upvotes and comments as they come in.'],
  }),
  featured: record => ({
    subject: `${record.name || 'Your project'} is featured on Digivated`,
    label: 'DIGIVATED / FEATURED', title: 'Your project is featured.',
    paragraphs: [`${record.name || 'Your project'} now has a featured spot on the Digivated homepage.`],
    cta: { label: 'View your listing', href: listing(record) },
  }),
  rejected: record => ({
    subject: 'Your Digivated project has an update',
    label: 'DIGIVATED / REVIEW', title: 'Your project was reviewed.',
    paragraphs: [`${record.name || 'Your project'} was reviewed and not approved this time. Sign in to read the reviewer’s notes and update it.`],
    cta: { label: 'Open your projects', href: ACCOUNT },
  }),
  archived: record => ({
    subject: 'Your Digivated project has an update',
    label: 'DIGIVATED / UPDATE', title: 'Your project was archived.',
    paragraphs: [`${record.name || 'Your project'} is no longer listed. Sign in for details.`],
    cta: { label: 'Open your projects', href: ACCOUNT },
  }),
  pending: record => ({
    subject: 'Your Digivated project has an update',
    label: 'DIGIVATED / REVIEW', title: 'Your project is back in review.',
    paragraphs: [`${record.name || 'Your project'} is being reviewed again. We’ll email you when that’s done.`],
    cta: { label: 'Open your projects', href: ACCOUNT },
  }),
  feedback: record => ({
    subject: 'New private feedback on your Digivated project',
    label: 'DIGIVATED / FEEDBACK', title: 'You have new private feedback.',
    paragraphs: [`The Digivated team left private feedback on ${record.name || 'your project'}. Sign in to read it.`],
    cta: { label: 'Read your feedback', href: ACCOUNT },
  }),
};

export function projectUpdate(previous, record) {
  if (!record?.accountId || !record.email || !previous) return null;
  const statusChanged = previous.status !== record.status;
  const feedbackChanged = (previous.reviewFeedback || '') !== (record.reviewFeedback || '');
  if (!statusChanged && !feedbackChanged) return null;
  const make = statusChanged ? (updates[record.status] || updates.pending) : updates.feedback;
  const { subject, ...content } = make(record);
  return { to: record.email, subject, ...renderEmail({ ...content, preheader: content.paragraphs[0], footer }), idempotencyKey: `digivated-project-${record.id}-r${record.revision}` };
}

// Emails only go to the account's confirmed address, and only if it still matches the project.
async function confirmedOwner(record, to, env, accountClient) {
  if (!accountClient && (!env.COMMUNITY_SUPABASE_URL || !env.COMMUNITY_SUPABASE_SECRET_KEY)) return null;
  const client = accountClient || createClient(env.COMMUNITY_SUPABASE_URL, env.COMMUNITY_SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.admin.getUserById(record.accountId);
  return !error && data?.user?.email_confirmed_at && data.user.email?.trim().toLowerCase() === to.trim().toLowerCase();
}

export async function sendProjectUpdate(previous, record, env = process.env, fetcher = fetch, accountClient) {
  const update = projectUpdate(previous, record);
  if (!update) return 'skipped';
  if (!env.RESEND_API_KEY || !env.ACCOUNT_EMAIL_FROM) return 'unavailable';
  try {
    const owner = await confirmedOwner(record, update.to, env, accountClient);
    if (owner === null) return 'unavailable';
    if (!owner) return 'failed';
    return await sendEmail(env, fetcher, update) ? 'sent' : 'failed';
  } catch { return 'failed'; }
}

export function awardEmail(record, rank, weekStart) {
  if (!record?.accountId || !record.email || ![1, 2, 3].includes(rank)) return null;
  const week = new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const place = ['', '#1', '#2', '#3'][rank];
  return {
    to: record.email,
    subject: `${record.name || 'Your project'} placed ${place} this week on Digivated`,
    ...renderEmail({
      label: 'DIGIVATED / WEEKLY PODIUM', title: `★ ${place} launch of the week.`,
      preheader: `${record.name || 'Your project'} finished ${place} in the week of ${week}.`,
      paragraphs: [`${record.name || 'Your project'} finished ${place} in Digivated’s launches for the week of ${week}. It’s now on the Weekly winners page.`, 'Your dashboard has an award badge you can add to your site.'],
      cta: { label: 'Get your award badge', href: ACCOUNT },
      footer: [{ label: 'Weekly winners', href: 'https://digivated.com/winners' }, ...footer],
    }),
    idempotencyKey: `digivated-award-${record.id}-${new Date(weekStart).toISOString().slice(0, 10)}`,
  };
}

export async function sendAwardEmail(record, rank, weekStart, env = process.env, fetcher = fetch, accountClient) {
  const message = awardEmail(record, rank, weekStart);
  if (!message) return 'skipped';
  if (!env.RESEND_API_KEY || !env.ACCOUNT_EMAIL_FROM) return 'unavailable';
  try {
    const owner = await confirmedOwner(record, message.to, env, accountClient);
    if (owner === null) return 'unavailable';
    if (!owner) return 'failed';
    return await sendEmail(env, fetcher, message) ? 'sent' : 'failed';
  } catch { return 'failed'; }
}

// Free launches only go live once the badge is on the maker's site.
const launchDay = record => new Date(freeLaunchTime(record)).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const badgeTip = 'Using an AI site builder or coding assistant? Copy your badge HTML from Digivated and paste it into the chat with this prompt: “Add this exact HTML to my homepage footer. Keep the link, image, and data attributes intact, and make sure the badge is in the published page’s HTML. Show me what changed so I can publish it.” Paste your badge HTML below the prompt.';
const badgeWhen = record => freeLaunchTime(record) > Date.now() ? `is booked for ${launchDay(record)}` : 'is waiting to go live';
const badgeSteps = 'Copy the badge from Your Projects, add it to your homepage footer, and publish your site. Then click Check my website in Digivated. Once we find the badge, your project is ready for launch.';
const badgeMessages = {
  finish: record => ({
    subject: `One step left to launch ${record.name || 'your project'}`,
    label: 'DIGIVATED / LAUNCH', title: 'Your badge is the last step.',
    paragraphs: [`${record.name || 'Your project'} ${badgeWhen(record)}. It stays off the board until the Digivated badge is on your site.`, badgeSteps],
    cta: { label: 'Open your badge', href: `${ACCOUNT}#project-${encodeURIComponent(record.id)}` },
    after: [badgeTip],
  }),
  nudge: record => ({
    subject: `One step left to launch ${record.name || 'your project'}`,
    label: 'DIGIVATED / LAUNCH', title: 'Add your badge to launch.',
    paragraphs: [`${record.name || 'Your project'} ${badgeWhen(record)}. It only goes live once the Digivated badge is on your site.`, badgeSteps],
    cta: { label: 'Open your badge', href: `${ACCOUNT}#project-${encodeURIComponent(record.id)}` },
    after: [badgeTip],
  }),
  'last-call': record => ({
    subject: `${record.name || 'Your project'} launches ${launchDay(record)}. Your badge is still missing`,
    label: 'DIGIVATED / LAST CALL', title: 'Your launch is almost here.',
    paragraphs: [`${record.name || 'Your project'} launches ${launchDay(record)}, and the badge is still missing on ${record.url}.`, 'Add the badge to your homepage footer, publish your site, then click Check my website in Digivated. Your launch waits until the badge is verified.'],
    cta: { label: 'Add your badge now', href: `${ACCOUNT}#project-${encodeURIComponent(record.id)}` },
    after: [badgeTip],
  }),
  verified: record => ({
    subject: `Badge found. ${record.name || 'Your project'} launches ${launchDay(record)}`,
    label: 'DIGIVATED / LAUNCH', title: 'You’re all set.',
    paragraphs: [`We found the Digivated badge on your site, so ${record.name || 'your project'} is locked in for ${launchDay(record)} at 9:00 AM Eastern.`, 'Keep the badge up. It shows your live upvotes and links people to your listing.'],
    cta: { label: 'Open your dashboard', href: ACCOUNT },
  }),
};
export function badgeEmail(record, stage) {
  if (!record?.accountId || !record.email || !badgeMessages[stage] || !record.launch?.scheduledAt) return null;
  const { subject, ...content } = badgeMessages[stage](record);
  return { to: record.email, subject, ...renderEmail({ ...content, preheader: content.paragraphs[0], footer }), idempotencyKey: `digivated-badge-${stage}-${record.id}` };
}
export async function sendBadgeEmail(record, stage, env = process.env, fetcher = fetch, accountClient) {
  const message = badgeEmail(record, stage);
  if (!message) return 'skipped';
  const mailEnv = stage !== 'verified' && env.SIGNUP_RESEND_API_KEY && env.SIGNUP_EMAIL_FROM
    ? { RESEND_API_KEY: env.SIGNUP_RESEND_API_KEY, ACCOUNT_EMAIL_FROM: env.SIGNUP_EMAIL_FROM }
    : env;
  if (!mailEnv.RESEND_API_KEY || !mailEnv.ACCOUNT_EMAIL_FROM) return 'unavailable';
  try {
    const owner = await confirmedOwner(record, message.to, env, accountClient);
    if (owner === null) return 'unavailable';
    if (!owner) return 'failed';
    return await sendEmail(mailEnv, fetcher, message) ? 'sent' : 'failed';
  } catch { return 'failed'; }
}
