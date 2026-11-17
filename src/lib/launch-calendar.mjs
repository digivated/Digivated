const DAY = 86400000;
export function launchTimestamp(project) {
  // Only legacy records without publication metadata fall back to submission.
  return Date.parse(project.publishedAt || project.date);
}
export function launchBounds(batch, now = Date.now()) {
  const date = new Date(now);
  const monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - ((date.getUTCDay()+6)%7)*DAY;
  const start = monday - (batch === 'previous' ? 7*DAY : 0);
  return { start, end: start+7*DAY };
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
  const format=value=>new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  return `${batch==='previous'?'Last week’s':'This week’s'} launches · ${format(start)} – ${format(end-DAY)} (UTC)`;
}


export function rankingPeriodStarts(now) {
  const date = new Date(now);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return [day, launchBounds('current', now).start, Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)];
}

// Fair start: from Monday 00:00 UTC until Tuesday 14:00 UTC (24 hours after the
// free batch goes live), this week's launches show in an hourly-shuffled order
// with upvote counts hidden, so an early burst can't lock in the top spots.
export const FAIR_START_HOURS = 38;
export function fairStart(now = Date.now()) {
  const { start } = launchBounds('current', now);
  const endsAt = start + FAIR_START_HOURS * 3_600_000;
  return { active: now >= start && now < endsAt, endsAt };
}
// Same order for everyone within an hour; it rotates every hour.
export function fairOrder(id, now = Date.now()) {
  let hash = 2166136261;
  for (const ch of `${Math.floor(now / 3_600_000)}:${id}`) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash;
}
