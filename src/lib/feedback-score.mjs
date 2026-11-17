// Shared by the review prompt (live points preview) and the server (authoritative award).
// A review earns points only when it is specific, the visitor actually spent time on
// the product, and the reviewer is signed in. The server recomputes everything.
export const REVIEW_MIN_SECONDS = 20;
export const REVIEW_FIELD_MAX = 240;
export const DAILY_POINT_CAP = 60;
export const BOOST_POINTS_PER_VOTE = 10;
export const impressions = { clear: 'Instantly clear', minute: 'Took a minute', confusing: 'Confusing' };

const words = value => String(value || '').toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];

export function scoreReview({ works = '', improve = '', impression = '', seconds = 0 } = {}) {
  const all = [...words(works), ...words(improve)];
  const unique = new Set(all).size;
  const text = `${works} ${improve}`;
  const spam = /(https?:\/\/|www\.)/i.test(text) || /(.)\1{5,}/u.test(text) || (all.length >= 6 && unique / all.length < 0.4);
  const checks = {
    visited: Number(seconds) >= REVIEW_MIN_SECONDS,
    specific: all.length >= 8 && unique >= 6,
    both: words(works).length >= 3 && words(improve).length >= 3,
    detailed: all.length >= 25 && unique >= 18,
    impression: Object.hasOwn(impressions, impression),
  };
  const useful = !spam && checks.specific;
  const points = useful ? 5 + (checks.both ? 3 : 0) + (checks.detailed ? 5 : 0) + (checks.impression ? 1 : 0) : 0;
  return { useful, points, spam, checks };
}

export function boostVotes(points) {
  return Math.floor((Number(points) || 0) / BOOST_POINTS_PER_VOTE);
}
