// Shared by the visit prompt and the server (which decides). A comment left after
// visiting a product earns points when it is specific and the visitor spent real
// time on the product. Points earned this week lift the commenter's own launch.
export const REVIEW_MIN_SECONDS = 20;
export const DAILY_POINT_CAP = 60;
export const BOOST_POINTS_PER_VOTE = 10;

const words = value => String(value || '').toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];

export function scoreReview({ comment = '', seconds = 0 } = {}) {
  const all = words(comment);
  const unique = new Set(all).size;
  const spam = /(https?:\/\/|www\.)/i.test(comment) || /(.)\1{5,}/u.test(comment) || (all.length >= 6 && unique / all.length < 0.4);
  const visited = Number(seconds) >= REVIEW_MIN_SECONDS;
  const useful = !spam && all.length >= 8 && unique >= 6;
  const detailed = useful && all.length >= 25 && unique >= 18;
  return { useful, visited, detailed, points: useful && visited ? 5 + (detailed ? 5 : 0) : 0 };
}

export function boostVotes(points) {
  return Math.floor((Number(points) || 0) / BOOST_POINTS_PER_VOTE);
}

// Progress toward the next bonus upvote, for the points cards.
export function boostProgress(points, per = BOOST_POINTS_PER_VOTE) {
  const value = Math.max(0, Math.floor(Number(points) || 0));
  const into = value % per;
  return { boosts: Math.floor(value / per), into, toNext: per - into, bar: `[${'■'.repeat(into)}${'□'.repeat(per - into)}]` };
}
