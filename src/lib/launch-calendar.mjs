const DAY = 86_400_000;
const easternDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' });
const easternHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' });

function easternLaunchTime(utcDay) {
  // At 14:00 UTC the local hour is either 09:00 or 10:00.
  const candidate = utcDay + 14 * 3_600_000;
  return candidate - (Number(easternHour.format(candidate)) - 9) * 3_600_000;
}

export function nextFreeLaunch(now = Date.now()) {
  const parts = Object.fromEntries(easternDate.formatToParts(now).map(({ type, value }) => [type, Number(value)]));
  const today = Date.UTC(parts.year, parts.month - 1, parts.day);
  const monday = today + ((8 - new Date(today).getUTCDay()) % 7) * DAY;
  const first = easternLaunchTime(monday);
  return new Date(first > now ? first : easternLaunchTime(monday + 7 * DAY)).toISOString();
}

export const skippedNovemberBatch = Date.UTC(2026, 10, 30);
export const novemberBatchTime = easternLaunchTime(Date.UTC(2026, 10, 23));

export function freeLaunchTime(record) {
  const date = Date.parse(record.launch?.scheduledAt);
  if (!Number.isFinite(date) || record.launch?.kind !== 'free') return date;
  if (date === skippedNovemberBatch) {
    const saved = Date.parse(record.date);
    // The previous booking rule put the Nov 16–22 cohort a week too late.
    if (saved >= Date.UTC(2026, 10, 16) && saved < Date.UTC(2026, 10, 23)) return novemberBatchTime;
  }
  // Midnight UTC was a legacy calendar-date marker, never the intended publish time.
  return date % DAY === 0 && new Date(date).getUTCDay() === 1 ? easternLaunchTime(date) : date;
}

export function freeLaunchSchedule(record) {
  const time = freeLaunchTime(record);
  return Number.isFinite(time) ? { scheduledAt: new Date(time).toISOString(), scheduledTimestamp: time } : {};
}

export const freeLaunchDay = value => new Date(value).toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York',
});
export function launchTimestamp(project) {
  // Only legacy records without publication metadata fall back to submission.
  return Date.parse(project.publishedAt || project.date);
}
// Launch weeks run from Monday 9 AM Eastern to the next Monday 9 AM Eastern, so each
// week ends exactly when the next free launch goes live and the weekly lists hand over at that moment.
function launchWeekMonday(now) {
  const parts = Object.fromEntries(easternDate.formatToParts(now).map(({ type, value }) => [type, Number(value)]));
  const today = Date.UTC(parts.year, parts.month - 1, parts.day);
  let monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
  if (easternLaunchTime(monday) > now) monday -= 7 * DAY;
  return monday;
}
export function launchBounds(batch, now = Date.now()) {
  const monday = launchWeekMonday(now) - (batch === 'previous' ? 7 * DAY : 0);
  return { start: easternLaunchTime(monday), end: easternLaunchTime(monday + 7 * DAY) };
}
export function inLaunchBatch(project, batch, now = Date.now()) {
  if (!['current','previous'].includes(batch)) return true;
  const launched = launchTimestamp(project);
  const {start,end} = launchBounds(batch,now);
  return Number.isFinite(launched) && launched >= start && launched < end && launched <= now;
}
export function readRankingPeriod(value,batch) {
  return ['daily','weekly','monthly','all'].includes(value) ? value : batch === 'current' ? 'weekly' : batch === 'previous' ? 'all' : 'daily';
}
export function launchBatchLabel(batch,now=Date.now()) {
  const {start,end}=launchBounds(batch,now);
  const format=value=>new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/New_York'});
  return `${batch==='previous'?'Last week’s':'This week’s'} launches · ${format(start)} – ${format(end-12*3_600_000)} (Eastern)`;
}


export function rankingPeriodStarts(now) {
  const date = new Date(now);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return [day, launchBounds('current', now).start, Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)];
}

// Fair start runs from Monday’s 9 AM Eastern launch and ends 24 hours later. Until then,
// this week's launches show in an hourly-shuffled order
// with upvote counts hidden, so an early burst can't lock in the top spots.
export function fairStart(now = Date.now()) {
  const { start } = launchBounds('current', now);
  const endsAt = start + DAY;
  return { active: now >= start && now < endsAt, endsAt };
}
// Same order for everyone within an hour; it rotates every hour.
export function fairOrder(id, now = Date.now()) {
  let hash = 2166136261;
  for (const ch of `${Math.floor(now / 3_600_000)}:${id}`) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash;
}
