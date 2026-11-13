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
