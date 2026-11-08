import { redisClient } from './submissions.mjs';
import { membership } from '../src/data/membership.mjs';
export const OFFER_VERSION = 'digivated-membership-5-once-v1';
export const CHECKOUT_KEY = 'digivated:membership:checkout';
export function verifiedCheckout(raw) {
  try {
    const item = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return item?.version === OFFER_VERSION && item.productId === membership.gumroadProductId && item.price === 500 && item.billing === 'one-time' && item.status === 'ready';
  } catch { return false; }
}
export async function checkoutStatus(redis) {
  const ready = verifiedCheckout(await redis(['GET', CHECKOUT_KEY]));
  return ready ? { ready:true, checkoutUrl:membership.checkoutUrl, priceUSD:5, billing:'one-time' } : { ready:false };
}
export function makeMembershipCheckoutHandler(deps = {}) {
  return async (req,res) => {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('CDN-Cache-Control','no-store');
    res.setHeader('Vercel-CDN-Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET'){res.setHeader('Allow','GET');res.statusCode=405;res.end(JSON.stringify({ready:false}));return;}
    try { res.statusCode=200;res.end(JSON.stringify(await checkoutStatus(deps.redis||redisClient(deps.env||process.env)))); }
    catch { res.statusCode=200;res.end(JSON.stringify({ready:false})); }
  };
}
