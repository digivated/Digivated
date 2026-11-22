// Launch visibility: trust-weighted launch score, momentum ("Rising now"),
// fair start, the weekly podium and per-day maker stats.
//
// Money never buys rank: the score only counts upvotes, comments from other
// members and feedback points. Featured and paid spots are placements, shown
// apart from the lists and labelled as such.
import { inLaunchBatch, launchBounds, launchTimestamp, fairStart } from '../src/lib/launch-calendar.mjs';
import { BOOST_POINTS_PER_VOTE } from '../src/lib/feedback-score.mjs';
import { publicRecords, projectPublic, storageKey } from './admin-store.mjs';
import { addNotification } from './notifications.mjs';
import { sendAwardEmail } from './account-mail.mjs';

const DAY = 86_400_000;
export const VOTE_WEIGHT = Object.freeze({ guest: 1, member: 2, trusted: 3 });
export const COMMENTER_POINTS = 2;
export const TRUST_DAYS = 7;
export const RISING_DAYS = 30;
export const STATS_DAYS = 14;

export const voteWeightKey = id => `digivated:launch:vote-weight:${id}`;
export const voterKey = (id, account) => `digivated:launch:voter:${id}:${account}`;
export const trustFirstKey = account => `digivated:trust:first:${account}`;
export const trustPostsKey = account => `digivated:trust:posts:${account}`;
export const podiumWeekKey = start => `digivated:podium:week:${new Date(start).toISOString().slice(0, 10)}`;
export const podiumProjectKey = id => `digivated:podium:project:${id}`;
export const PODIUM_WEEKS = 'digivated:podium:weeks';
export const statsKey = (id, now = Date.now()) => `digivated:stats:project:${id}:${new Date(now).toISOString().slice(0, 10)}`;
const STATS_TTL = 100 * 86400;

/* ---------- Trust ---------- */
// A member is "trusted" after 7 days on Digivated and at least one post
// (comment, reply or thread). Their upvotes weigh more than a new account's,
// and any account's more than an anonymous visitor's.
export async function noteMember(redis, accountId, now = Date.now()) {
  if (accountId) await redis(['SET', trustFirstKey(accountId), String(now), 'NX']);
}
export async function notePost(redis, accountId, now = Date.now()) {
  if (!accountId) return;
  await noteMember(redis, accountId, now);
  await redis(['INCR', trustPostsKey(accountId)]);
}
export async function memberWeight(redis, accountId, now = Date.now()) {
  const [first, posts] = await Promise.all([redis(['GET', trustFirstKey(accountId)]), redis(['GET', trustPostsKey(accountId)])]);
  const since = Number(first);
  return Number.isFinite(since) && since > 0 && now - since >= TRUST_DAYS * DAY && Number(posts) >= 1 ? VOTE_WEIGHT.trusted : VOTE_WEIGHT.member;
}

// Called after a new upvote. An account lends its weight to one vote per
// project; a second vote from the same account (another network) counts as a guest's.
export async function recordVoteWeight(redis, { id, visitor, account, now = Date.now() }) {
  if (!account?.id) return VOTE_WEIGHT.guest;
  await noteMember(redis, account.id, now);
  const claimed = await redis(['SET', voterKey(id, account.id), visitor, 'NX']);
  if (claimed !== 'OK' && await redis(['GET', voterKey(id, account.id)]) !== visitor) return VOTE_WEIGHT.guest;
  const weight = await memberWeight(redis, account.id, now);
  await redis(['HSET', voteWeightKey(id), visitor, String(weight)]);
  return weight;
}
export async function forgetVoteWeight(redis, { id, visitor, account }) {
  await redis(['HDEL', voteWeightKey(id), visitor]);
  if (account?.id && await redis(['GET', voterKey(id, account.id)]) === visitor) await redis(['DEL', voterKey(id, account.id)]);
}

/* ---------- Scores (one round trip for a whole page of projects) ---------- */
// ARGV: start, end, risingStart, now, commenterPoints, pointsPerBoostVote, id1, id2, …
// Per id returns {upvotes, weighted, commenters, points, score, rising} for the
// window [start, end) and momentum over [risingStart, now].
export const SCORES = `
local start, finish, rstart, now = ARGV[1], '('..ARGV[2], ARGV[3], ARGV[4]
local cpts, per = tonumber(ARGV[5]), tonumber(ARGV[6])
local out = {}
local function voters(id, a, b)
  local list = redis.call('ZRANGEBYSCORE', 'digivated:card:votes:project:'..id, a, b)
  local weighted = 0
  for _, v in ipairs(list) do weighted = weighted + (tonumber(redis.call('HGET', 'digivated:launch:vote-weight:'..id, v) or '1') or 1) end
  return #list, weighted
end
local function commenters(id, owner, a, b)
  local seen, people = {}, 0
  for _, cid in ipairs(redis.call('ZRANGEBYSCORE', 'digivated:card:comments:project:'..id, a, b, 'LIMIT', 0, 300)) do
    local raw = redis.call('GET', 'digivated:card:comment:'..cid)
    if raw then
      local ok, e = pcall(cjson.decode, raw)
      if ok and type(e) == 'table' and e.status == 'approved' and type(e.accountId) == 'string' and e.accountId ~= owner and not seen[e.accountId] then
        seen[e.accountId] = true; people = people + 1
      end
    end
  end
  return people
end
for i = 7, #ARGV do
  local id = ARGV[i]
  local owner = ''
  local raw = redis.call('GET', 'digivated:submission:'..id)
  if raw then local ok, r = pcall(cjson.decode, raw); if ok and type(r) == 'table' and type(r.accountId) == 'string' then owner = r.accountId end end
  local count, weighted = voters(id, start, finish)
  local people = commenters(id, owner, start, finish)
  local points = 0
  if owner ~= '' then
    for _, m in ipairs(redis.call('ZRANGEBYSCORE', 'digivated:points:ledger:'..owner, start, finish)) do points = points + (tonumber(string.match(m, ':(%d+)$')) or 0) end
  end
  local score = weighted + people * cpts + math.floor(points / per)
  local _, rweighted = voters(id, rstart, now)
  local rising = rweighted + commenters(id, owner, rstart, now) * cpts
  out[#out + 1] = {count, weighted, people, points, score, rising}
end
return out`;

export async function launchScores(redis, ids, { start, end, now = Date.now() }) {
  if (!ids.length) return new Map();
  const rows = await redis(['EVAL', SCORES, 0, start, end, now - DAY, now, COMMENTER_POINTS, BOOST_POINTS_PER_VOTE, ...ids]);
  return new Map(ids.map((id, i) => {
    const [upvotes, weighted, commenters, points, score, rising] = (rows?.[i] || []).map(Number);
    return [id, { upvotes: upvotes || 0, weighted: weighted || 0, commenters: commenters || 0, points: points || 0, score: score || 0, rising: rising || 0 }];
  }));
}

// Adds launch scores to this week's launches and momentum to the last 30 days.
// During fair start, this week's counts are withheld and rows are marked fresh.
export async function withLaunchScores(redis, items, now = Date.now()) {
  const fair = fairStart(now);
  const recent = items.filter(item => now - launchTimestamp(item) <= RISING_DAYS * DAY);
  if (!recent.length) return { items, fair };
  const { start } = launchBounds('current', now);
  let scores;
  try { scores = await launchScores(redis, recent.map(item => item.id), { start, end: now + 1, now }); }
  catch { return { items, fair }; }
  return {
    fair,
    items: items.map(item => {
      const s = scores.get(item.id);
      if (!s) return item;
      const current = inLaunchBatch(item, 'current', now);
      const { boost, ...rest } = item;
      if (current && fair.active) return { ...rest, fresh: true, votes: { all: null, daily: null, weekly: null, monthly: null } };
      return {
        ...rest,
        ...(current ? { score: s.score, commenters: s.commenters, ...(s.points > 0 ? { boost: s.points } : {}) } : {}),
        ...(s.rising > 0 ? { rising: s.rising } : {}),
      };
    }),
  };
}

// True when this project is in this week's launches during fair start.
export async function isFresh(redis, id, now = Date.now()) {
  if (!fairStart(now).active) return false;
  try {
    const record = JSON.parse(await redis(['GET', storageKey('submission', id)]));
    const project = record && projectPublic(record);
    return !!project && inLaunchBatch(project, 'current', now);
  } catch { return false; }
}

/* ---------- Weekly podium ---------- */
export async function batchProjects(redis, batch, now = Date.now()) {
  const found = [];
  const total = Number(await redis(['ZCARD', 'digivated:public:submissions'])) || 0;
  for (let offset = 0; offset < total; offset += 100) {
    const page = await publicRecords(redis, 'submission', offset, 100);
    found.push(...page.filter(item => inLaunchBatch(item, batch, now)));
  }
  return [...new Map(found.map(item => [item.id, item])).values()];
}

// Freezes last week's results once the week is over: every launch's final
// score, and #1–#3 (score above zero) as the podium. Safe to call repeatedly.
export async function finalizeLastWeek(redis, now = Date.now()) {
  const { start, end } = launchBounds('previous', now);
  const key = podiumWeekKey(start);
  const existing = await redis(['GET', key]);
  if (existing) return JSON.parse(existing);
  if (await redis(['SET', `${key}:lock`, '1', 'NX', 'EX', 120]) !== 'OK') return null;
  try {
    const projects = await batchProjects(redis, 'previous', now);
    const scores = await launchScores(redis, projects.map(p => p.id), { start, end, now });
    const results = projects.map(p => ({ id: p.id, ...scores.get(p.id) }))
      .sort((a, b) => b.score - a.score || b.weighted - a.weighted || b.commenters - a.commenters || a.id.localeCompare(b.id))
      .map(({ id, score, upvotes, commenters }) => ({ id, score, upvotes, commenters }));
    const podium = results.filter(r => r.score > 0).slice(0, 3).map((r, i) => ({ ...r, rank: i + 1 }));
    const week = { start: new Date(start).toISOString(), end: new Date(end).toISOString(), podium, results: results.slice(0, 200) };
    if (await redis(['SET', key, JSON.stringify(week), 'NX']) !== 'OK') return JSON.parse(await redis(['GET', key]));
    await redis(['ZADD', PODIUM_WEEKS, start, week.start]);
    const byId = new Map(projects.map(p => [p.id, p]));
    for (const place of podium) {
      await redis(['ZADD', podiumProjectKey(place.id), place.rank, week.start]);
      const project = byId.get(place.id);
      try {
        const record = JSON.parse(await redis(['GET', storageKey('submission', place.id)]));
        if (record?.accountId && project) await addNotification(redis, { recipientId: record.accountId, type: 'award', link: '/#last-week', actorName: project.name, verb: `placed #${place.rank} in last week’s launches` });
        if (record?.accountId) await sendAwardEmail(record, place.rank, start).catch(() => 'failed');
      } catch { /* The podium is saved either way. */ }
    }
    return week;
  } finally { await redis(['DEL', `${key}:lock`]).catch(() => {}); }
}

export async function readWeek(redis, start) {
  try { return JSON.parse(await redis(['GET', podiumWeekKey(start)])); } catch { return null; }
}

// The best place a project has earned, for its award badge.
export async function bestPlace(redis, id) {
  const rows = await redis(['ZRANGE', podiumProjectKey(id), 0, -1, 'WITHSCORES']);
  let best = null;
  for (let i = 0; i < (rows?.length || 0); i += 2) {
    const place = { week: rows[i], rank: Number(rows[i + 1]) };
    if (!best || place.rank < best.rank || (place.rank === best.rank && place.week > best.week)) best = place;
  }
  return best;
}

/* ---------- Maker stats ---------- */
export const statsTotalKey = id => `digivated:stats:project:${id}:total`;
export async function bumpStat(redis, id, field, now = Date.now()) {
  const key = statsKey(id, now);
  await redis(['HINCRBY', key, field, 1]);
  await redis(['EXPIRE', key, STATS_TTL]);
  if (field === 'visits') await redis(['HINCRBY', statsTotalKey(id), 'visits', 1]);
}
// Daily numbers for the last two weeks. Upvotes and comments come from their own
// timestamped records, so they include history from before daily stats existed;
// views and visits are counted per day from when tracking began.
export async function readStats(redis, id, now = Date.now(), days = STATS_DAYS) {
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const dates = Array.from({ length: days }, (_, i) => today - (days - 1 - i) * DAY);
  const [rows, votes, comments] = await Promise.all([
    Promise.all(dates.map(date => redis(['HMGET', statsKey(id, date), 'views', 'visits']))),
    redis(['ZRANGEBYSCORE', `digivated:card:votes:project:${id}`, dates[0], '+inf', 'WITHSCORES']),
    redis(['ZRANGEBYSCORE', `digivated:card:comments:project:${id}`, dates[0], '+inf', 'WITHSCORES']),
  ]);
  const bucket = list => { const counts = new Array(days).fill(0); for (let i = 1; i < (list?.length || 0); i += 2) { const at = Math.floor((Number(list[i]) - dates[0]) / DAY); if (at >= 0 && at < days) counts[at] += 1; } return counts; };
  const up = bucket(votes), said = bucket(comments);
  return dates.map((date, i) => {
    const [views, visits] = (rows[i] || []).map(value => Number(value) || 0);
    return { date: new Date(date).toISOString().slice(0, 10), views, visits, upvotes: up[i], comments: said[i] };
  });
}
// Lifetime numbers, from the same records the public pages use.
export async function allTimeStats(redis, id) {
  const [views, upvotes, comments, visits] = await Promise.all([
    redis(['GET', `digivated:project-views:${id}`]),
    redis(['GET', `digivated:card:likes:project:${id}`]),
    redis(['ZCARD', `digivated:card:comments:project:${id}`]),
    redis(['HGET', statsTotalKey(id), 'visits']),
  ]);
  return { views: Number(views) || 0, visits: Number(visits) || 0, upvotes: Number(upvotes) || 0, comments: Number(comments) || 0 };
}
