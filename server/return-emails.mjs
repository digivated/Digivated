import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { verifiedAccount } from './project-account.mjs';
import { redisClient } from './submissions.mjs';
import { notificationPreferencesKey } from './notifications.mjs';
import { renderEmail } from './email-layout.mjs';
import { weeklyMembers as MEMBERS, weeklyPreference as preference, emailSubscriberId, isEmailSubscriber, weeklyOptOut, stopWeeklyEmail } from './weekly-subscriptions.mjs';

// Small on-theme pages for the unsubscribe link.
const page=(title,body,form='')=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${title}</title></head><body style="margin:0;background:#0b0b0b;color:#e7e7e7"><main style="max-width:520px;margin:12vh auto;padding:24px;font:16px/1.6 Arial,Helvetica,sans-serif"><p style="margin:0 0 18px;color:#bfc2c5;font:700 12px/1.5 'Courier New',monospace;letter-spacing:1.5px">[ DIGIVATED / EMAIL ]</p><h1 style="margin:0 0 12px;font-size:26px;line-height:1.25">${title}</h1><p style="margin:0 0 22px;color:#c8c8c8">${body}</p>${form}<p style="margin:26px 0 0"><a href="https://digivated.com" style="color:#c8c8c8">Back to Digivated &rarr;</a></p></main></body></html>`;

const tokenKey=token=>`digivated:weekly:confirm:${token}`;
const sign=(id,secret)=>createHmac('sha256',secret).update(`weekly-unsubscribe:${id}`).digest('hex');
const valid=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const json=(res,status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data));};
const admin=env=>createClient(env.COMMUNITY_SUPABASE_URL,env.COMMUNITY_SUPABASE_SECRET_KEY,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
const pending = { subscribed: false, pending: true };
function weeklyMailer(env) {
 if (env.SIGNUP_RESEND_API_KEY && env.SIGNUP_EMAIL_FROM) {
  return { apiKey: env.SIGNUP_RESEND_API_KEY, from: env.SIGNUP_EMAIL_FROM };
 }
 return { apiKey: env.RESEND_API_KEY, from: env.WEEKLY_EMAIL_FROM || env.ACCOUNT_EMAIL_FROM };
}
const normalizeEmail = value => {
 const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
 return email.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email) ? email : '';
};
const sameSite = req => req.headers.origin === 'https://digivated.com' && req.headers['sec-fetch-site'] !== 'cross-site' && /^application\/json(?:;|$)/i.test(req.headers['content-type'] || '');
const CONFIRM = `
if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET',KEYS[2],ARGV[2])
redis.call('ZADD',KEYS[3],'NX',0,ARGV[3])
redis.call('DEL',KEYS[1],KEYS[4])
return 1`;

async function sendConfirmation(redis, { id, email }, mailer, fetcher, logger) {
 const daily = `digivated:weekly:confirmation-day:${new Date().toISOString().slice(0,10)}`;
 const count = Number(await redis(['INCR', daily]));
 if (count === 1) await redis(['EXPIRE', daily, 172800]);
 if (count > 20) return { status: 429, body: { error: 'Email confirmations are busy today. Try again tomorrow.' } };
 const token = randomBytes(24).toString('hex');
 const key = tokenKey(token);
 await redis(['SET', key, JSON.stringify({ id, email }), 'EX', 86400]);
 const message = renderEmail({
  label: 'DIGIVATED / WEEKLY', title: 'Confirm your weekly digest',
  paragraphs: ['Confirm to get a weekly email with new launches on Digivated.'],
  cta: { label: 'Confirm subscription', href: `https://digivated.com/email-preferences?token=${token}` },
  after: ['If you didn’t request this, ignore this email. The link expires in 24 hours.'],
 });
 try {
  const response = await fetcher('https://api.resend.com/emails', {
   method: 'POST', headers: { Authorization: `Bearer ${mailer.apiKey}`, 'Content-Type': 'application/json' },
   body: JSON.stringify({ from: mailer.from, to: [email], subject: 'Confirm your Digivated weekly email', ...message }),
   signal: AbortSignal.timeout(8000), redirect: 'error',
  });
  if (response.ok) return { status: 200, body: pending };
  logger.warn('weekly-confirmation provider rejected send', { status: response.status });
 } catch {
  logger.warn('weekly-confirmation provider request failed');
 }
 await redis(['DEL', key]);
 return { status: 503, body: { error: 'Could not send confirmation. Try again later.' } };
}

async function bodyOf(req){let body=req.body;if(body===undefined){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2048)throw Error('Invalid request');chunks.push(chunk);}body=Buffer.concat(chunks).toString('utf8');}if(Buffer.isBuffer(body))body=body.toString('utf8');if(typeof body==='string')body=JSON.parse(body);if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>2048)throw Error('Invalid request');return body;}

export function makeReturnEmailHandler(deps={}){return async(req,res)=>{
 const env=deps.env||process.env;
 const mailer=weeklyMailer(env),logger=deps.logger||console;
 try{
  if(!env.SUBMISSIONS_REDIS_REST_TOKEN||!mailer.apiKey||!mailer.from)return json(res,503,{error:'Email preferences are temporarily unavailable.'});
  const redis=deps.redis||redisClient(env),url=new URL(req.url,'https://digivated.com'),action=url.searchParams.get('action');
  if(req.method==='GET'&&action==='unsubscribe'){
   const id=url.searchParams.get('id'),signature=url.searchParams.get('signature');
   if(!id||!valid(signature,sign(id,env.SUBMISSIONS_REDIS_REST_TOKEN)))return json(res,400,{error:'Invalid unsubscribe link.'});
   // GET only displays a confirmation page. Email scanners cannot unsubscribe someone.
   res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.end(page('Digivated weekly emails','Stop receiving the weekly project email?','<form method="post"><button style="padding:12px 20px;border:1px solid #ececec;background:#ececec;color:#0a0a0a;font:700 14px Arial,Helvetica,sans-serif;cursor:pointer">Unsubscribe</button></form>'));
  }
  if(req.method==='POST'&&action==='unsubscribe'){
   const id=url.searchParams.get('id'),signature=url.searchParams.get('signature');
   if(!id||!valid(signature,sign(id,env.SUBMISSIONS_REDIS_REST_TOKEN)))return json(res,400,{error:'Invalid unsubscribe link.'});
   const record = isEmailSubscriber(id) ? null : JSON.parse(await redis(['GET', preference(id)]) || 'null');
   const emailId = isEmailSubscriber(id) ? id : record?.email ? emailSubscriberId(record.email,env.SUBMISSIONS_REDIS_REST_TOKEN) : null;
   await stopWeeklyEmail(redis,id,emailId);
   res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.end(page('You are unsubscribed.','You will not receive the weekly project email.'));
  }
  if(req.method==='POST'&&action==='confirm'){
   if(!sameSite(req))return json(res,403,{error:'Open Digivated to confirm.'});
   const {token}=await bodyOf(req);if(typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))return json(res,400,{error:'Invalid link.'});
   const key=tokenKey(token),raw=await redis(['GET',key]);if(!raw)return json(res,410,{error:'This link has expired. Request another from the footer.'});
   const {id,email}=JSON.parse(raw),emailId=emailSubscriberId(email,env.SUBMISSIONS_REDIS_REST_TOKEN);
   const fromFooter=isEmailSubscriber(id);
   if(fromFooter){
    if(id!==emailId)return json(res,410,{error:'This link is no longer valid.'});
   } else {
    const {data,error}=await (deps.adminClient||admin(env)).auth.admin.getUserById(id);
    if(error||data?.user?.email?.toLowerCase()!==email)return json(res,410,{error:'This link is no longer valid.'});
   }
   const record=JSON.stringify({email,consentedAt:new Date().toISOString(),source:fromFooter?'footer weekly email confirmation':'account weekly email confirmation'});
   if(!Number(await redis(['EVAL',CONFIRM,4,key,preference(id),MEMBERS,weeklyOptOut(emailId),raw,record,id])))return json(res,410,{error:'This confirmation link has already been used.'});
   return json(res,200,{ok:true});
  }
  if(req.method==='POST'&&action==='subscribe'){
   if(!sameSite(req))return json(res,403,{error:'Open Digivated to subscribe.'});
   if(!env.WEEKLY_EMAIL_POSTAL_ADDRESS)return json(res,503,{error:'Weekly emails are being set up. Check back soon.'});
   const {email:input}=await bodyOf(req),email=normalizeEmail(input);
   if(!email)return json(res,400,{error:'Enter a valid email address.'});
   const ip=req.headers['x-real-ip'];
   if(typeof ip!=='string'||!isIP(ip))return json(res,503,{error:'Email signup is temporarily unavailable.'});
   const secret=env.SUBMISSIONS_REDIS_REST_TOKEN,id=emailSubscriberId(email,secret);
   const day=new Date().toISOString().slice(0,10);
   const network=createHmac('sha256',secret).update(`weekly-signup:${day}:${ip}`).digest('hex');
   const limit=`digivated:weekly:signup:${network}`;
   const attempts=Number(await redis(['INCR',limit]));
   if(attempts===1)await redis(['EXPIRE',limit,86400]);
   if(attempts>8)return json(res,429,{error:'Too many signup attempts. Try again tomorrow.'});
   if(await redis(['GET',preference(id)]))return json(res,200,pending);
   const cooldown=`digivated:weekly:signup-cooldown:${id}`;
   if(await redis(['SET',cooldown,'1','NX','EX',900])!=='OK')return json(res,200,pending);
   const result=await sendConfirmation(redis,{id,email},mailer,deps.fetcher||fetch,logger);
   if(result.status!==200)await redis(['DEL',cooldown]);
   return json(res,result.status,result.body);
  }
  if(!['GET','POST'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
  if(req.method==='POST'&&!sameSite(req))return json(res,403,{error:'Open Digivated to change preferences.'});
  const account=await (deps.verifyAccount||verifiedAccount)(req,env,deps.fetcher||fetch);if(!account)return json(res,401,{error:'Sign in to manage email preferences.'});
  const emailId=emailSubscriberId(account.email,env.SUBMISSIONS_REDIS_REST_TOKEN);
  if((req.method==='GET'&&action==='status')||(req.method==='POST'&&action==='on')){
   const own=JSON.parse(await redis(['GET',preference(account.id)])||'null');
   const guest=account.mailboxVerified===false?null:await redis(['GET',preference(emailId)]);
   const subscribed=!!(guest||own?.email===account.email)&&!await redis(['GET',weeklyOptOut(emailId)]);
   if(action==='status')return json(res,200,{subscribed,available:!!env.WEEKLY_EMAIL_POSTAL_ADDRESS});
   if(subscribed)return json(res,200,{subscribed:true});
  }
  if(req.method==='POST'&&action==='off'){
   const own=JSON.parse(await redis(['GET',preference(account.id)])||'null');
   await stopWeeklyEmail(redis,account.id,account.mailboxVerified!==false||own?.email===account.email?emailId:null);
   return json(res,200,{subscribed:false});
  }
  if(req.method==='POST'&&action==='on'){
   if(!env.WEEKLY_EMAIL_POSTAL_ADDRESS)return json(res,503,{error:'Weekly emails are being set up. Please check back soon.'});
   const limit=`digivated:weekly:request:${account.id}`;
   if(Number(await redis(['INCR',limit]))>3)return json(res,429,{error:'Please try again tomorrow.'});
   await redis(['EXPIRE',limit,86400]);
   const result=await sendConfirmation(redis,{id:account.id,email:account.email},mailer,deps.fetcher||fetch,logger);
   return json(res,result.status,result.body);
  }
  return json(res,404,{error:'Not found.'});
 }catch{return json(res,503,{error:'Email preferences are temporarily unavailable.'});}
};}

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
 '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const directoryUrl = 'https://digivated.com/discover';

const notificationsUrl = 'https://digivated.com/notifications';
const announcementIssue = '2026-11-15';
const announcementTitle = 'What’s new on Digivated';
const announcementCopy = 'When your project goes live, you’ll now see its approval in Notifications, with a link straight to your listing. You can also choose which replies, follows, messages, and project feedback you want to hear about. Thanks for sharing what you’re building.';
const FIRST_MONDAY_DIGEST = Date.UTC(2026, 10, 23, 15);
const LAST_SUNDAY_DIGEST = Date.UTC(2026, 10, 22, 15);
function digestContent(projects, unsubscribe, address, announce = false) {
 const link = project => `https://digivated.com/projects/listing/${encodeURIComponent(project.id)}`;
 const text = [
  ...(announce ? [announcementTitle, announcementCopy, `Open Notifications: ${notificationsUrl}`] : []),
  ...(projects.length ? ['New this week on Digivated', 'A short list of indie projects that went live this week.'] : []),
  ...projects.map(project => `${project.name}\n${link(project)}`),
  `Browse all projects: ${directoryUrl}`,
  `Unsubscribe: ${unsubscribe}\n\nDigivated\n${address}`
 ].join('\n\n');
 const items = projects.map(project =>
  `<li style="margin:0 0 14px"><a style="color:#f1f1f1;text-decoration:underline;overflow-wrap:anywhere" href="${link(project)}">${escapeHtml(project.name)}</a></li>`
 ).join('');
 const announcement = announce ? `<h1 style="margin:0 0 12px;color:#f1f1f1;font:700 23px/1.3 'Courier New',monospace">${announcementTitle}</h1>
<p style="margin:0 0 14px;color:#c8c8c8">${announcementCopy}</p>
<p style="margin:0 0 30px"><a href="${notificationsUrl}" style="color:#f1f1f1;text-decoration:underline">Open Notifications &rarr;</a></p>` : '';
 const projectHeading = announce ? 'h2' : 'h1';
 const projectList = projects.length ? `<${projectHeading} style="margin:0 0 12px;color:#f1f1f1;font:700 25px/1.2 'Courier New',monospace">New this week</${projectHeading}>
<p style="margin:0 0 24px;color:#c8c8c8">A short list of indie projects that went live this week.</p>
<ul style="margin:0 0 24px;padding-left:24px;color:#bfc2c5">${items}</ul>` : '';
 const html = `<!doctype html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>New this week on Digivated</title></head>
<body bgcolor="#0b0b0b" style="margin:0;background-color:#0b0b0b;color:#e7e7e7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0b0b0b" style="background-color:#0b0b0b">
<tr><td align="center">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;text-align:left;background-color:#0b0b0b">
<tr><td style="padding:36px 24px 32px;color:#e7e7e7;font:16px/1.65 Arial,sans-serif">
<p style="margin:0 0 22px;color:#bfc2c5;font:700 13px/1.5 'Courier New',monospace;letter-spacing:1px">[ DIGIVATED / WEEKLY ]</p>
${announcement}${projectList}
<p style="margin:0 0 32px;font:700 15px/1.5 'Courier New',monospace"><a href="${directoryUrl}" style="color:#f1f1f1;text-decoration:underline">Browse all projects &rarr;</a></p>
<p style="margin:0;color:#a9a9a9;font-size:13px;line-height:1.6">Digivated<br>${escapeHtml(address).replace(/\r?\n/g, '<br>')}<br><a style="color:#c8c8c8;text-decoration:underline" href="${escapeHtml(unsubscribe)}">Unsubscribe</a></p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
 return { text, html };
}

export function makeWeeklyDigestHandler(deps={}){return async(req,res)=>{
 const env=deps.env||process.env;
 if(req.method!=='GET'||!env.CRON_SECRET||!valid(req.headers.authorization,`Bearer ${env.CRON_SECRET}`))return json(res,401,{error:'Unauthorized.'});
 const mailer=weeklyMailer(env);
 if(!env.WEEKLY_EMAIL_POSTAL_ADDRESS||!mailer.apiKey||!mailer.from||!env.COMMUNITY_SUPABASE_SECRET_KEY)return json(res,503,{error:'Weekly emails are not configured.'});
 const logger = deps.logger || console;
 try {
  const redis = deps.redis || redisClient(env);
  const now = (deps.now || Date.now)(), week = 7 * 86400000;
  const issue = new Date(now);
  const issueWeekday = now >= FIRST_MONDAY_DIGEST ? 1 : 0;
  issue.setUTCDate(issue.getUTCDate() - ((issue.getUTCDay() - issueWeekday + 7) % 7));
  issue.setUTCHours(15, 0, 0, 0);
  if (+issue > now) issue.setUTCDate(issue.getUTCDate() - 7);
  // The first Monday follows the last Sunday send by one day. Use the
  // previous issue's actual cutoff so the two issues cannot share launches.
  const since = +issue === FIRST_MONDAY_DIGEST ? LAST_SUNDAY_DIGEST : +issue - week;
  const issueDate = issue.toISOString().slice(0, 10);
  const finish = (status, summary) => {
   logger.info('weekly-digest result', { issue: issueDate, ...summary });
   return json(res, status, summary);
  };
  const ids = await redis(['ZREVRANGE','digivated:public:submissions',0,199]);
  const rows = ids.length ? await redis(['MGET',...ids.map(id => `digivated:submission:${id}`)]) : [];
  const projects = rows.flatMap((raw, index) => {
   if (!raw) return [];
   const project = JSON.parse(raw);
   const published = Date.parse(project.publishedAt || project.reviewedAt);
   return ['approved', 'featured'].includes(project.status) && published > since && published <= +issue
    ? [{ id: ids[index], name: project.name, published }] : [];
  }).sort((a,b) => b.published - a.published).slice(0,3);
  const announcementWeek = issueDate === announcementIssue;
  if (!projects.length && !announcementWeek) return finish(200, { sent: 0, reason: 'no new projects' });
  const candidates = await redis(['ZRANGEBYSCORE', MEMBERS, 0, +issue - 1, 'LIMIT', 0, projects.length ? 10 : 100]);
  const members = [];
  for (const id of candidates) {
   // Email announcements need an explicit, saved opt-in; the in-app default does not count.
   const saved = announcementWeek ? await redis(['GET', notificationPreferencesKey(id)]).then(raw => JSON.parse(raw || 'null')).catch(() => null) : null;
   const announce = announcementWeek && saved?.enabled === true;
   if (projects.length || announce) members.push({id, announce});
   if (members.length === 10) break;
  }
  if (!members.length) return finish(200, { sent: 0, reason: 'no eligible subscribers' });
  const accounts = (deps.adminClient || admin(env)).auth.admin;
  let sent = 0, failed = 0, skipped = 0;
  for (const {id, announce} of members) {
   try {
    const stored = await redis(['GET',preference(id)]);
    if (!stored) { await redis(['ZREM', MEMBERS, id]); skipped++; continue; }
    const email = normalizeEmail(JSON.parse(stored).email);
    if (!email) { await stopWeeklyEmail(redis,id); skipped++; continue; }
    const emailId = emailSubscriberId(email,env.SUBMISSIONS_REDIS_REST_TOKEN);
    if (await redis(['GET',weeklyOptOut(emailId)])) {
     await stopWeeklyEmail(redis,id); skipped++; continue;
    }
    if (isEmailSubscriber(id)) {
     if (id !== emailId) { await stopWeeklyEmail(redis,id); skipped++; continue; }
    } else {
     const { data, error } = await accounts.getUserById(id);
     if (error && error.status !== 404) throw error;
     if (error || data?.user?.email?.toLowerCase() !== email) {
      await stopWeeklyEmail(redis,id); skipped++; continue;
     }
    }
    const delivery = `digivated:weekly:sent:${issueDate}:${emailId}`;
    if (await redis(['GET',delivery])) {
     await redis(['ZADD',MEMBERS,'XX',now,id]); skipped++; continue;
    }
    const unsubscribe = `https://digivated.com/api/return-emails?action=unsubscribe&id=${emailId}&signature=${sign(emailId,env.SUBMISSIONS_REDIS_REST_TOKEN)}`;
    const response = await (deps.fetcher || fetch)('https://api.resend.com/emails', {
     method: 'POST',
     headers: { Authorization: `Bearer ${mailer.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `weekly-${emailId}-${issueDate}` },
     body: JSON.stringify({
      from: mailer.from, to: [email], subject: announce ? announcementTitle : 'New projects on Digivated',
      ...digestContent(projects, unsubscribe, env.WEEKLY_EMAIL_POSTAL_ADDRESS, announce),
      headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
     }),
     signal: AbortSignal.timeout(8000), redirect: 'error'
    });
    if (!response.ok) { logger.warn('weekly-digest provider rejected send', { status: response.status }); failed++; continue; }
    await redis(['SET',delivery,'1','EX',14*86400]);
    await redis(['ZADD',MEMBERS,'XX',now,id]);
    sent++;
   } catch {
    logger.warn('weekly-digest recipient processing failed');
    failed++;
   }
  }
  return finish(failed ? 503 : 200, { sent, failed, skipped });
 } catch {
  logger.error('weekly-digest run failed');
  return json(res,503,{error:'Weekly email run failed.'});
 }
};}
