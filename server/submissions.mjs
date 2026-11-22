import { defaultNotificationPreferences, notificationPreferencesKey, notifyProjectApproval, notifyLaunchScheduled } from './notifications.mjs';
import { sendProjectUpdate } from './account-mail.mjs';
import { badgeSnippet, nextFreeLaunch, verifyProjectBadge } from './launch-queue.mjs';
import { readProjectSite, siteDetails, siteExtras, readPublicImage, hasProjectBadge } from './project-site.mjs';
import { guessCategory } from '../src/lib/project-taxonomy.mjs';
// Isolated from purchase handlers, sessions, rate-limit rules, and environment names.
// founding-access imports redisClient from this module. The membership helpers are
// used only inside request handlers, after both modules have finished loading.
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
// Badge-first launches: the project ID is reserved (and signed for this account)
// before saving, so the real badge can be installed and verified in one step.
const reserveToken=(secret,accountId,id)=>createHmac('sha256',secret).update(`badge-reserve:${accountId}:${id}`).digest('hex');
const sameToken=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
import { projectPricingOptions } from '../src/lib/project-pricing.mjs';
import { acceptedProjectCategories, safeUrl } from '../src/data/community.mjs';
import { FoundingError, foundingConfig, verifyFoundingEmail } from './founding-access.mjs';
import { resolvePlan, plansUsage } from './plans.mjs';
import { planOf, isPaidPlan, PLANS } from '../src/lib/plans.mjs';
import { membership } from '../src/data/membership.mjs';
import { accountIndex, verifiedAccount } from './project-account.mjs';
import { projectPublic, SAVE_EDIT, validId } from './admin-store.mjs';

async function instantLaunchConfig(env, fetcher) {
  if (env.INSTANT_LAUNCH_ENABLED !== 'true') return null;
  const price = Number(env.INSTANT_LAUNCH_PRICE_CENTS);
  const gumroadToken = env.FOUNDING_GUMROAD_ACCESS_TOKEN;
  let checkout;
  try { checkout = new URL(env.INSTANT_LAUNCH_CHECKOUT_URL); } catch { return null; }
  if (!gumroadToken || !Number.isSafeInteger(price) || price < 100 || price > 10000 ||
      checkout.origin !== 'https://digivated.gumroad.com' ||
      !/^\/l\/[\w-]+$/.test(checkout.pathname) || checkout.search || checkout.hash ||
      checkout.username || checkout.password) return null;

  const slug = checkout.pathname.split('/').pop();
  try {
    const response = await fetcher('https://api.gumroad.com/v2/products', {
      headers: { Authorization: `Bearer ${gumroadToken}`, Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.success !== true || !Array.isArray(data.products)) return null;
    const product = data.products.find(item =>
      (item.custom_permalink || item.permalink) === slug ||
      item.short_url === checkout.href
    );
    const productId = product?.id;
    if (!/^[A-Za-z0-9+=/_-]{8,120}$/.test(productId || '') ||
        [env.FOUNDING_GUMROAD_PRODUCT_ID, env.GUMROAD_PRODUCT_ID].includes(productId) ||
        (env.INSTANT_LAUNCH_PRODUCT_ID && productId !== env.INSTANT_LAUNCH_PRODUCT_ID) ||
        product.published !== true || product.price !== price || product.currency !== 'usd' ||
        product.subscription_duration || product.is_tiered_membership) return null;
    return { productId, price, checkoutUrl: checkout.href, gumroadToken };
  } catch {
    return null;
  }
}

async function publishInstantProject(redis, account, id, config, fetcher) {
  if (!validId(id)) throw new SubmissionError(400, 'Choose a saved project.');
  const key = `digivated:submission:${id}`;
  const record = JSON.parse(await redis(['GET', key]));
  if (record?.accountId !== account.id || record.email.toLowerCase() !== account.email ||
      record.promotion?.included !== 'instant-launch') throw new SubmissionError(404, 'Saved project not found.');
  if (record.promotion.verified && projectPublic(record)) return projectPublic(record);
  if (record.status !== 'pending') throw new SubmissionError(409, 'This project is no longer awaiting payment.');
  let saleId;
  // Password sign-ups never proved they own the address, so they only claim a
  // purchase made after this project was saved (a fresh checkout for it).
  const savedAt = Date.parse(record.date);
  const notBefore = account.mailboxVerified === false ? (Number.isFinite(savedAt) ? savedAt - 120000 : Infinity) : 0;
  try {
    ({ saleId } = await verifyFoundingEmail(account.email, {
      productId: config.productId, gumroadToken: config.gumroadToken, minimumPriceUSD: config.price, allowTest: false, notBefore
    }, fetcher));
  } catch (error) {
    if (error instanceof FoundingError && error.status === 401) {
      throw new SubmissionError(409, 'We could not find an eligible payment for your account email. If you just paid, wait a moment and try again.');
    }
    throw new SubmissionError(503, 'Payment verification is temporarily unavailable. Try again here after checkout.');
  }
  const now = new Date();
  const updated = {
    ...record, status: 'approved', publishedAt: now.toISOString(), revision: (record.revision || 0) + 1,
    promotion: { ...record.promotion, verified: true, verifiedAt: now.toISOString() }
  };
  const projection = projectPublic(updated);
  if (!projection) throw new SubmissionError(409, 'The listing is incomplete. Contact Digivated before publishing.');
  const saleKey = createHmac('sha256', 'digivated:instant-launch').update(config.productId + ':' + saleId).digest('hex');
  const saved = await redis(['EVAL', SAVE_EDIT, 5, key, 'digivated:submissions',
    `digivated:public:submission:${id}`, 'digivated:public:submissions', `digivated:instant-sale:${saleKey}`,
    record.revision || 0, JSON.stringify(updated), JSON.stringify(projection), now.getTime(), 'submission']);
  if (saved !== 1) {
    const latest = JSON.parse(await redis(['GET', key]));
    if (latest?.accountId === account.id && latest.promotion?.verified && projectPublic(latest)) return projectPublic(latest);
    if (saved === -3) throw new SubmissionError(409, 'That purchase has already been used.');
    if (saved === -2) throw new SubmissionError(409, 'This account already has a live project.');
    throw new SubmissionError(409, 'The project changed. Refresh and try again.');
  }
  try { await notifyProjectApproval(redis, record, updated); } catch { /* Publication already succeeded. */ }
  try { await sendProjectUpdate(record, updated); } catch { /* Publication already succeeded. */ }
  return projection;
}

// Backing out of an unpaid Instant checkout. If the payment already went
// through, publish instead so nobody loses a purchase; otherwise remove the
// unpaid draft so the maker can pick another launch option straight away.
const CANCEL_INSTANT = `local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end
local row=cjson.decode(raw)
if row.accountId~=ARGV[1] or row.status~='pending' or type(row.promotion)~='table' or row.promotion.included~='instant-launch' or row.promotion.verified then return -1 end
redis.call('DEL',KEYS[1]); redis.call('ZREM',KEYS[2],ARGV[2]); redis.call('ZREM',KEYS[3],ARGV[2]); return 1`;
async function cancelInstantProject(redis, account, id, config, fetcher, secret) {
  if (!validId(id)) throw new SubmissionError(400, 'Choose a saved project.');
  const key = `digivated:submission:${id}`;
  const record = JSON.parse(await redis(['GET', key]));
  if (!record) return { cancelled: true };
  if (record.accountId !== account.id || record.promotion?.included !== 'instant-launch') throw new SubmissionError(404, 'Saved project not found.');
  if (record.promotion.verified || record.status !== 'pending') throw new SubmissionError(409, 'This project is already paid for and can’t be cancelled here.');
  if (config) {
    try {
      const project = await publishInstantProject(redis, account, id, config, fetcher);
      return { published: true, pageUrl: project.pageUrl };
    } catch (error) {
      if (!(error instanceof SubmissionError && error.status === 409 && /could not find an eligible payment/i.test(error.message))) {
        throw new SubmissionError(503, 'We couldn’t confirm whether you paid, so nothing was cancelled. Try again in a moment.');
      }
    }
  }
  const removed = await redis(['EVAL', CANCEL_INSTANT, 3, key, 'digivated:submissions', accountIndex(record.email, secret), account.id, id]);
  if (removed === -1) throw new SubmissionError(409, 'This project changed. Refresh Your Projects.');
  return { cancelled: true };
}

export class SubmissionError extends Error { constructor(status,message) { super(message); this.status=status; } }
export function validateSubmission(body) {
  const fail = message => {throw new SubmissionError(400,message);};
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Please use the project submission form.');
  if (body.company) fail('Please use the project submission form.');
  const text = (key,max,required=true) => {const value=body[key];if(value===undefined&&!required)return '';if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))fail(`Please check ${key}.`);return value.trim();};
  const creator=text('creator',100), email=text('email',254), name=text('name',120), url=text('url',500), description=text('description',600), category=text('category',40), social=text('social',200,false), notes=text('notes',2000,false);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
  if (!safeUrl(url)) fail('Enter a valid HTTP or HTTPS project URL.');
  if (description.length<20) fail('Describe your project in at least 20 characters.');
  const pricing = text('pricing', 24, false);
  if (pricing && !projectPricingOptions.includes(pricing)) fail('Choose a listed pricing option.');
  if (!acceptedProjectCategories.includes(category)) fail('Choose a listed category.');
  if (body.consent!==true) fail('Please confirm you have permission to submit this project.');
  const submissionType = body.submissionType || 'directory';
  if (!['directory','promotion','founding-feature','instant'].includes(submissionType)) fail('Choose a valid submission type.');
  let promotion;
  if (submissionType === 'promotion') {
    if (body.promotionPurchased !== true) fail('Purchase the Digivated promo on Gumroad before submitting a promotion request.');
    promotion = { requested:true, receiptReference:text('promotionReceipt',120), verified:false };
  } else if (submissionType === 'founding-feature') {
    // The handler replaces this after checking the founding session. Callers cannot mark it paid or verified.
    promotion = { requested:true, included:'founding-membership', verified:false };
  }
  if (submissionType === 'instant') promotion = { requested: true, included: 'instant-launch', verified: false };
  if (!body.image) fail('Add at least one project image.');
  let image='';
  if (body.image) {
    if (typeof body.image!=='string') fail('Invalid image.');
    const match=body.image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) fail('Choose a JPG, PNG, or WebP image.');
    const bytes=Buffer.from(match[2],'base64');
    const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if (!valid||bytes.length>500*1024||bytes.length<12) fail('Use a valid JPG, PNG, or WebP image up to 500 KB.');
    image=body.image;
  }
  // Never accept caller-supplied status, ID, approval, picks, or timestamps.
  return {...(promotion ? {promotion} : {}),...(pricing ? { pricing } : {}),creator,email,name,url:safeUrl(url),description,category,social,notes,image,consent:true,consentVersion:1,emailOutreachConsent:body.emailOutreachConsent===true,status:'pending',pick:false};
}
export function redisClient(env=process.env,fetcher=fetch) {
  const endpoint=env.SUBMISSIONS_REDIS_REST_URL, token=env.SUBMISSIONS_REDIS_REST_TOKEN;
  let url;try {url=new URL(endpoint);}catch{throw new SubmissionError(503,'Submissions are not open yet. Please check back soon.');}
  if(url.protocol!=='https:'||!token)throw new SubmissionError(503,'Submissions are not open yet. Please check back soon.');
  return async command=>{const response=await fetcher(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(8000),redirect:'error'});if(!response.ok)throw new Error('Storage unavailable');const result=await response.json();if(result.error)throw new Error('Storage unavailable');return result.result;};
}
const ONE_ACTIVE_SUBMISSION = `
local accountKey=KEYS[#KEYS-(ARGV[4] and 1 or 0)]
local incoming=cjson.decode(ARGV[1])
-- Plan limits: free 1, starter 3, member unlimited (0). Counts waiting + live.
local limit=({starter=3,member=0})[incoming.plan or 'free'] or 1
local used=0
for _,id in ipairs(redis.call('ZRANGE',accountKey,0,-1)) do
 local raw=redis.call('GET','digivated:submission:'..id)
 if raw then
  local row=cjson.decode(raw)
  local owned=not row.accountId or row.accountId==incoming.accountId
  if owned and (row.status=='pending' or row.status=='approved' or row.status=='featured') then used=used+1 end
 end
end
if limit>0 and used>=limit then return -2 end
`;
// Commit the explicit in-app choice alongside the submission. Older clients
// omit it. Turning the master switch off preserves individual preferences.
const SAVE_ACTIVITY_CHOICE = `
if ARGV[4] then
 local preferences=cjson.decode(ARGV[4])
 if not preferences.enabled then
  local raw=redis.call('GET',KEYS[#KEYS])
  local ok,stored=pcall(cjson.decode,raw or '')
  if ok and type(stored)=='table' then
   for key,_ in pairs(preferences) do
    if key~='enabled' and type(stored[key])=='boolean' then preferences[key]=stored[key] end
   end
  end
 end
 redis.call('SET',KEYS[#KEYS],cjson.encode(preferences))
end
return 1`;
const SAVE = ONE_ACTIVE_SUBMISSION + `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],3600) end; if n>5 then return 0 end; redis.call('SET',KEYS[2],ARGV[1]); redis.call('ZADD',KEYS[3],ARGV[2],ARGV[3]); redis.call('ZADD',KEYS[4],ARGV[2],ARGV[3]);
if incoming.launch and incoming.launch.badgeVerifiedAt then
 redis.call('ZADD','digivated:launch:free',incoming.launch.scheduledTimestamp,ARGV[3])
end
` + SAVE_ACTIVITY_CHOICE;
const PLAN_CHECK_FAILED = 'We couldn’t confirm your plan right now. Your details are still here; try again in a moment.';
function limitMessage(plan) {
  if (plan === 'starter') return 'Starter includes 3 projects on Digivated at a time. Get Membership ($5) for unlimited projects, or archive one in Your Projects.';
  return 'Free accounts can have 1 project on Digivated at a time. Get Starter ($3) for 3 projects or Membership ($5) for unlimited, or archive your project in Your Projects.';
}
// Paid plans skip review: save, then publish in the same request. If publishing
// fails for any reason, the project stays saved and waits for review instead.
async function publishPlanProject(redis, stored, now) {
  try {
    const updated = { ...stored, status: 'approved', publishedAt: now.toISOString(), revision: 1 };
    const projection = projectPublic(updated);
    if (!projection) return null;
    const saved = await redis(['EVAL', SAVE_EDIT, 4, `digivated:submission:${stored.id}`, 'digivated:submissions',
      `digivated:public:submission:${stored.id}`, 'digivated:public:submissions', 0, JSON.stringify(updated), JSON.stringify(projection), now.getTime(), 'submission']);
    if (saved !== 1) return null;
    try { await notifyProjectApproval(redis, stored, updated); } catch { /* Published already. */ }
    try { await sendProjectUpdate(stored, updated); } catch { /* Published already. */ }
    return projection;
  } catch { return null; }
}
async function planSummary(req, env, account, redis, fetcher, fresh) {
  const starter = await instantLaunchConfig(env, fetcher);
  const memberOn = foundingConfig(env).enabled;
  const { plan, checkFailed } = await resolvePlan({ req, env, account, redis, fetcher, starter, fresh });
  const used = await plansUsage(redis, accountIndex(account.email, env.SUBMISSIONS_REDIS_REST_TOKEN || 'test-only'), account.id);
  const { limit, name } = planOf(plan);
  return {
    plan, name, limit, used, remaining: limit ? Math.max(0, limit - used) : null, instant: isPaidPlan(plan), checkFailed,
    offers: {
      starter: starter && plan === 'free' ? { price: starter.price, checkoutUrl: starter.checkoutUrl, limit: PLANS.starter.limit } : null,
      member: memberOn && plan !== 'member' ? { price: membership.priceUSD * 100, checkoutUrl: membership.checkoutUrl } : null,
    },
  };
}
export function makeSubmissionHandler(deps={}) {
  return async(req,res)=>{
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
    try {
      const env=deps.env||process.env;
      if (req.method === 'GET' && new URL(req.url || '/api/submissions', 'https://digivated.invalid').searchParams.get('action') === 'launch-options') {
        const instant = await instantLaunchConfig(env, deps.fetcher || fetch);
        return send(200, instant ? { instant: { price: instant.price, checkoutUrl: instant.checkoutUrl }, nextFreeLaunch: nextFreeLaunch() } : { instant: null, nextFreeLaunch: nextFreeLaunch() });
      }
      if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw new SubmissionError(405,'Use the project submission form.');}
      const origin=env.SUBMISSIONS_ORIGIN||'https://digivated.com';
      if(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')throw new SubmissionError(403,'Open the submission form on Digivated and try again.');
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new SubmissionError(415,'Use the project submission form.');
      const max=710000;
      if(Number(req.headers['content-length']||0)>max)throw new SubmissionError(413,'The submission is too large.');
      let body=req.body;
      if(body===undefined){let size=0;const chunks=[];for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>max)throw new SubmissionError(413,'The submission is too large.');chunks.push(Buffer.from(chunk));}body=Buffer.concat(chunks).toString('utf8');}
      if(Buffer.isBuffer(body))body=body.toString('utf8');
      if(typeof body==='string'){if(Buffer.byteLength(body)>max)throw new SubmissionError(413,'The submission is too large.');try{body=JSON.parse(body);}catch{throw new SubmissionError(400,'Invalid submission.');}}
      if(Buffer.byteLength(JSON.stringify(body)||'')>max)throw new SubmissionError(413,'The submission is too large.');
      const account=req.headers.authorization?await (deps.verifyAccount||verifiedAccount)(req,env,deps.fetcher||fetch):null;
      if(!account)throw new SubmissionError(401,'Create an account or sign in before submitting your project.');
      if (['read-site','verify-badge'].includes(body?.action)) {
        const redis=deps.redis||redisClient(env);
        const key=`digivated:site-check:${account.id}`;
        const attempts=Number(await redis(['INCR',key]));if(attempts===1)await redis(['EXPIRE',key,3600]);
        if(!Number.isFinite(attempts)||attempts>20)throw new SubmissionError(429,'Too many website checks. Try again in an hour.');
        try {
          if(body.action==='verify-badge')return send(200,await verifyProjectBadge(redis,account,body.id,deps.readSite));
          if(typeof body.url!=='string'||body.url.length>500)throw Error('Enter your public HTTPS project URL.');
          const page=await (deps.readSite||readProjectSite)(body.url);
          const base=siteDetails(page.html),extra=siteExtras(page.html,page.url||body.url);
          const name=extra.name||base.name;
          // The site icon becomes the logo when we can fetch one; never fatal.
          const readImage=deps.readImage||(deps.readSite?null:readPublicImage);
          let logo=null;
          const iconDeadline=Date.now()+6000; // stay well inside the function's time limit
          if(readImage)for(const icon of extra.icons.slice(0,3)){if(Date.now()>iconDeadline)break;try{logo=await Promise.race([readImage(icon),new Promise((_,reject)=>setTimeout(()=>reject(Error('slow')),Math.max(1,iconDeadline-Date.now())))]);break;}catch{}}
          return send(200,{...base,name,category:guessCategory(`${name} ${base.description}`),social:extra.social,url:page.url||body.url,logo});
        }catch(error){throw new SubmissionError(400,error.message||'Could not check that website. You can enter details manually.');}
      }
      if (body?.action === 'reserve-badge') {
        const id=randomUUID();
        return send(200,{id,token:reserveToken(env.SUBMISSIONS_REDIS_REST_TOKEN||'test-only',account.id,id)});
      }
      if (body?.action === 'cancel-instant') {
        const instant = await instantLaunchConfig(env, deps.fetcher || fetch);
        return send(200, await cancelInstantProject(deps.redis || redisClient(env), account, body.id, instant, deps.fetcher || fetch, env.SUBMISSIONS_REDIS_REST_TOKEN || 'test-only'));
      }
      if (body?.action === 'publish-instant') {
        const instant = await instantLaunchConfig(env, deps.fetcher || fetch);
        if (!instant) throw new SubmissionError(403, 'Instant publishing is currently unavailable.');
        const project = await publishInstantProject(deps.redis || redisClient(env), account, body.id, instant, deps.fetcher || fetch);
        return send(200, { ok: true, id: project.id, pageUrl: project.pageUrl });
      }
      if (body?.action === 'plan') {
        const redis=deps.redis||redisClient(env);
        const key=`digivated:plan-check:${account.id}`;
        const attempts=Number(await redis(['INCR',key]));if(attempts===1)await redis(['EXPIRE',key,3600]);
        const fresh=body.fresh===true&&Number.isFinite(attempts)&&attempts<=30;
        return send(200,await planSummary(req,env,account,redis,deps.fetcher||fetch,fresh));
      }
      let record = validateSubmission(body);
      if(account&&record.email.toLowerCase()!==account.email)throw new SubmissionError(403,'Use the same email as your verified account.');
      const redis=deps.redis||redisClient(env);
      const starter=await instantLaunchConfig(env, deps.fetcher || fetch);
      const {plan,checkFailed}=await resolvePlan({req,env,account,redis,fetcher:deps.fetcher||fetch,starter});
      const paid=isPaidPlan(plan);
      // Paid plans publish instantly; the old per-project paid types now mean "use my plan".
      if (['instant-launch','founding-membership'].includes(record.promotion?.included)) {
        if (!paid) throw new SubmissionError(403, checkFailed ? PLAN_CHECK_FAILED : 'Instant publishing comes with Starter ($3) or Membership ($5). Buy one with your account email, then publish.');
        const { promotion, ...rest } = record; record = rest;
      }
      const ip=req.headers['x-real-ip'];
      if(!deps.redis && (env.VERCEL!=='1'||typeof ip!=='string'||!ip))throw new SubmissionError(503,'Submissions are temporarily unavailable. Please try again later.');
      const hash=createHmac('sha256',env.SUBMISSIONS_REDIS_REST_TOKEN||'test-only').update(String(ip||'fixture')).digest('hex');
      let id=randomUUID();const now=new Date();
      // Keep the ID used in the badge the maker may already have installed.
      let badgeVerifiedAt=null;
      if(body.reservedId!==undefined){
        if(record.promotion||typeof body.reservedId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.reservedId)||!sameToken(body.reservedToken,reserveToken(env.SUBMISSIONS_REDIS_REST_TOKEN||'test-only',account.id,body.reservedId)))throw new SubmissionError(400,'Your badge code expired. Refresh the page and copy the badge again.');
        if(Number(await redis(['EXISTS',`digivated:submission:${body.reservedId}`])))throw new SubmissionError(409,'This badge code was already used. Refresh the page to get a new one.');
        id=body.reservedId;
      }
      if(body.verifyBadge===true&&body.reservedId===undefined){
        throw new SubmissionError(400,'Badge verification is for free launches. Refresh the page and try again.');
      }
      if(body.reservedId!==undefined){
        const key=`digivated:site-check:${account.id}`;
        const attempts=Number(await redis(['INCR',key]));if(attempts===1)await redis(['EXPIRE',key,3600]);
        if(Number.isFinite(attempts)&&attempts<=20){
          try {
            const {html}=await (deps.readSite||readProjectSite)(record.url);
            if(hasProjectBadge(html,id))badgeVerifiedAt=now.toISOString();
          } catch { /* Save the submission so the maker can retry verification from their dashboard. */ }
        }
      }
      const scheduledAt=nextFreeLaunch(now.getTime());
      const stored={...record,plan,...(!record.promotion&&!paid?{launch:{kind:'free',version:1,scheduledAt,scheduledTimestamp:Date.parse(scheduledAt),...(badgeVerifiedAt?{badgeVerifiedAt}:{})}}:{}),...(account?{accountId:account.id}:{}),id,date:now.toISOString(),consentedAt:now.toISOString(),...(record.emailOutreachConsent?{emailOutreachConsentedAt:now.toISOString(),emailOutreachConsentVersion:2}:{})};
      const accountKey=accountIndex(record.email,env.SUBMISSIONS_REDIS_REST_TOKEN||'test-only');
      const activityNotifications = body.activityNotifications;
      if (activityNotifications !== undefined && typeof activityNotifications !== 'boolean') throw new SubmissionError(400, 'Choose a valid activity notification setting.');
      const keys = [`digivated:limit:${hash}`, `digivated:submission:${id}`, 'digivated:submissions', accountKey];
      const args = [JSON.stringify(stored), now.getTime(), id];
      if (typeof activityNotifications === 'boolean') {
        keys.push(notificationPreferencesKey(account.id));
        args.push(JSON.stringify({...defaultNotificationPreferences,enabled:activityNotifications}));
      }
      const saved = await redis(['EVAL', SAVE, keys.length, ...keys, ...args]);
      if(saved===-2)throw new SubmissionError(409,checkFailed?PLAN_CHECK_FAILED:limitMessage(plan));
      if(saved!==1){res.setHeader('Retry-After','3600');throw new SubmissionError(429,'You’ve reached the submission limit. Please try again in an hour.');}
      if(badgeVerifiedAt&&!paid){try{await notifyLaunchScheduled(redis,stored);}catch{/* Saved and verified; the notice is a courtesy. */}}
      if(paid){
        const published=await publishPlanProject(redis,stored,now);
        if(published)return send(201,{ok:true,id,status:'approved',plan,pageUrl:published.pageUrl,...(typeof activityNotifications === 'boolean' ? {activityNotifications} : {})});
      }
      send(201,{ok:true,id,status:'pending',plan,...(typeof activityNotifications === 'boolean' ? {activityNotifications} : {}),...(stored.launch?{launch:{...stored.launch,badge:badgeSnippet(id)}}:{})});
    }catch(error){send(error instanceof SubmissionError?error.status:503,{error:error instanceof SubmissionError?error.message:'Submissions are temporarily unavailable. Your details have not been cleared; please try again later.'});}
  };
}
