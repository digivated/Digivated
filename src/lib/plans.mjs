// Upload plans. Shared by the server (limits) and the site (copy), so they never disagree.
// A limit counts projects on the site right now: waiting (pending) and live
// (approved or featured). Archiving or deleting one frees a slot. 0 means unlimited.
export const PLANS = Object.freeze({
  free: Object.freeze({ id: 'free', name: 'Free', priceUSD: 0, limit: 1, instant: false }),
  starter: Object.freeze({ id: 'starter', name: 'Starter', priceUSD: 3, limit: 3, instant: true }),
  member: Object.freeze({ id: 'member', name: 'Membership', priceUSD: 5, limit: 0, instant: true }),
});

export const planOf = id => PLANS[id] || PLANS.free;
export const planLimit = id => planOf(id).limit;
export const isPaidPlan = id => planOf(id).instant;
// Higher rank wins when someone owns more than one plan.
export const planRank = id => ({ free: 0, starter: 1, member: 2 })[planOf(id).id];
export const slotsLabel = (id, used = 0) => {
  const limit = planLimit(id);
  return limit ? `${Math.min(used, limit)} of ${limit} project${limit === 1 ? '' : 's'} used` : `${used} project${used === 1 ? '' : 's'} · unlimited`;
};
