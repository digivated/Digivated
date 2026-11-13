import { projectCategory } from '../src/lib/project-taxonomy.mjs';
import { projectPricingOptions } from '../src/lib/project-pricing.mjs';
import { launchFields, pageSlug } from './launch-pages.mjs';
import { AdminError } from './admin-auth.mjs';
import { projectCategories, resourceCategories, normalizeResourceCategory, safeUrl, statuses } from '../src/data/community.mjs';
import { validateSubmission } from './submissions.mjs';
// The owner's original picks, verified against live records on 2026-10-15.
// Only existing approved records can be displayed. No records or view totals are seeded.
const originalPicks = new Set(['03e617c5-4841-43d1-8096-5fe4a556d053','141a4936-ebfa-4051-bdc8-31f0ad8dc74f']);
export const isDigivatedPick = record => ['approved','featured'].includes(record.status) && (typeof record.pickOverride === 'boolean' ? record.pickOverride : record.pick === true || originalPicks.has(record.id));
export const packetId = 'ui-ux-prompt-packet';
export const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(id);
export const storageKey = (kind, id) => kind === 'submission' ? `digivated:submission:${id}` : `digivated:${kind}:${id}`;
export const indexKey = kind => kind === 'submission' ? 'digivated:submissions' : `digivated:${kind}s`;
export function text(value, name, max, required = true) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new AdminError(400, `Check ${name}.`);
  return value.trim();
}
function imageValue(value) {
  if (!value) return '';
  try { return validateSubmission({ creator: 'Owner', email: 'owner@example.com', name: 'Image validation', url: 'https://example.com', description: 'Only used to validate an uploaded image.', category: 'Other', consent: true, image: value }).image; }
  catch { throw new AdminError(400, 'Use a JPG, PNG, or WebP image up to 500 KB.'); }
}
export function validateEdit(kind, input, previous) {
  if (!['submission', 'resource', 'product'].includes(kind)) throw new AdminError(400, 'Invalid content type.');
  if (!validId(input.id) || (kind === 'product' && input.id === packetId)) throw new AdminError(400, 'This product is protected or the identifier is invalid.');
  const revision = previous?.revision || 0;
  if (!Number.isInteger(input.revision) || input.revision !== revision) throw new AdminError(409, 'This item changed elsewhere. Reload it before saving.');
  const now = new Date().toISOString();
  let record;
  if (kind === 'submission') {
    if (!previous || previous.consent !== true) throw new AdminError(400, 'A submission with permission is required.');
    if (!statuses.includes(input.status) || !projectCategories.includes(input.category)) throw new AdminError(400, 'Choose a valid status and category.');
    if (input.status === 'featured' && !['approved', 'featured'].includes(previous.status)) throw new AdminError(400, 'Approve this project before featuring it.');
    const socialUrl = text(input.socialUrl, 'creator profile URL', 500, false);
    record = { ...previous, name: text(input.name, 'project name', 120), creator: text(input.creator, 'creator', 100), description: text(input.description, 'description', 600), category: input.category, status: input.status, reviewFeedback: text(input.reviewFeedback ?? previous.reviewFeedback ?? '', 'private review feedback', 1500, false), pickOverride: input.pick === true, pick: input.pick === true && ['approved', 'featured'].includes(input.status), socialUrl: socialUrl ? safeUrl(socialUrl) : '', url: safeUrl(text(input.url, 'project URL', 500)) };
    if(record.launch?.kind==='free'&&record.status==='pending'&&record.url!==previous.url){record.launch={...record.launch};delete record.launch.badgeVerifiedAt;}
    if (previous.promotion?.requested) {
      const approving = ['approved', 'featured'].includes(input.status);
      if (previous.promotion.included === 'instant-launch' && approving && !previous.promotion.verified) {
        throw new AdminError(400, 'The creator must verify their instant launch payment before publishing.');
      }
      const memberIncluded = previous.promotion.included === 'founding-membership' && typeof previous.promotion.memberSaleId === 'string';
      const verified = (memberIncluded && approving) || (previous.promotion.included === 'instant-launch' || input.promotionVerified === undefined ? previous.promotion.verified === true : input.promotionVerified === true);
      record.promotion = {...previous.promotion, verified};
      if (verified && !previous.promotion.verified) record.promotion.verifiedAt = now;
      if (!verified) delete record.promotion.verifiedAt;
      if (['approved','featured'].includes(record.status) && !verified) throw new AdminError(400,'Verify this Digivated promo purchase in Gumroad before publishing. Match the checkout email and order reference; confirm the payment is valid and not refunded.');
    }
    if (!record.url || (socialUrl && !record.socialUrl) || record.description.length < 20) throw new AdminError(400, 'Check the project description and links.');
    if (input.image) record.image = imageValue(input.image);
    if (input.removeImage === true) record.image = '';
    Object.assign(record, launchFields(input, previous));
    if (record.page) record.slug = previous.slug || pageSlug(record);
    if (!['approved','featured'].includes(record.status)) record.pagePublished = false;
    if (!record.publishedAt && !projectPublic(previous) && projectPublic(record)) record.publishedAt = now;
  } else {
    if (!['draft', 'published', 'archived'].includes(input.status)) throw new AdminError(400, 'Choose a valid publishing status.');
    record = { id: input.id, status: input.status, description: text(input.description, 'description', 600), date: previous?.date || now, image: input.removeImage === true ? '' : input.image ? imageValue(input.image) : previous?.image || '' };
    if (kind === 'resource') {
      const category = normalizeResourceCategory(input.category);
      if (!resourceCategories.includes(category)) throw new AdminError(400, 'Choose an article topic.');
      const date = text(input.publishedDate, 'publication date', 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new AdminError(400, 'Use a valid publication date.');
      const readingTime = Number(input.readingTime);
      if (!Number.isInteger(readingTime) || readingTime < 1 || readingTime > 180) throw new AdminError(400, 'Reading time must be 1–180 minutes.');
      const related = text(input.related || '', 'related articles', 1200, false).split(',').map(s => s.trim()).filter(Boolean);
      if (related.length > 10 || related.some(s => !validId(s))) throw new AdminError(400, 'Use up to 10 related article slugs, separated by commas.');
      record = { ...record, title: text(input.title, 'title', 160), category, publishedDate: date, readingTime, content: text(input.content, 'article content', 50000), related };
    } else {
      const url = text(input.url, 'product URL', 500);
      const destination = safeUrl(url) ? new URL(url) : null;
      const protectedPacket = destination && ((['mccovery.gumroad.com', 'digivated.gumroad.com'].includes(destination.hostname) && destination.pathname.replace(/\/$/, '') === '/l/ui-prompt-package') || (['digivated.com', 'digitalpromptpackage.vercel.app', 'digivated.vercel.app'].includes(destination.hostname) && destination.pathname.replace(/\/$/, '') === '/ui-ux-prompt-packet'));
      if (!destination || protectedPacket) throw new AdminError(400, 'Use the existing page for a different product. The UI/UX Prompt Packet is managed separately.');
      record = { ...record, name: text(input.name, 'product name', 120), url: safeUrl(url), label: text(input.label || '', 'product label', 160, false) };
    }
  }
  return { ...record, revision: revision + 1, reviewedAt: now };
}
export function projectPublic(record) {
  if (!['approved', 'featured'].includes(record.status) || record.consent !== true || (record.promotion?.requested && !record.promotion.verified)) return null;
  // Keep incomplete legacy submissions in their owners' accounts, but off every public surface.
  const destination = safeUrl(record.url);
  if (!record.image || !destination) return null;
  return { ...(record.promotion?.verified ? {sponsored:true} : {}), pageUrl: record.pagePublished && record.page?.consent && record.slug ? `/projects/${record.slug}` : `/projects/listing/${record.id}`, id: record.id, name: record.name, creator: record.creator, description: record.description, category: projectCategory(record), url: destination, socialUrl: safeUrl(record.socialUrl), date: record.date, ...(record.publishedAt ? { publishedAt: record.publishedAt } : {}), ...(projectPricingOptions.includes(record.pricing) ? { pricing: record.pricing } : {}), status: record.status, pick: isDigivatedPick(record), image: `/api/projects?image=${record.id}` };
}
export function contentPublic(kind, record) {
  if (record.status !== 'published') return null;
  const image = record.image ? `/api/content?type=${kind}&image=${record.id}` : '';
  if (kind === 'resource') return { id: record.id, slug: record.id, title: record.title, description: record.description, category: normalizeResourceCategory(record.category), date: record.publishedDate, readingTime: record.readingTime, content: record.content, related: record.related, coverImage: image, url: `/resources/read?slug=${record.id}` };
  return { id: record.id, name: record.name, description: record.description, label: record.label, url: record.url, image };
}
// Compare-and-save and public index update happen in one Redis script.
// Featured status belongs to each submission, so several projects can be featured.
export const SAVE_EDIT = `
local old=redis.call('GET',KEYS[1]); local revision=0
if old then revision=cjson.decode(old).revision or 0 end
if revision~=tonumber(ARGV[1]) then return 0 end
local record=cjson.decode(ARGV[2]); local id=record.id
if ARGV[5]=='submission' and ARGV[3]~='' then
 for _,otherId in ipairs(redis.call('ZRANGE',KEYS[4],0,-1)) do
  if otherId~=id then
   local raw=redis.call('GET','digivated:submission:'..otherId)
   if raw then
    local other=cjson.decode(raw)
    if other.status=='approved' or other.status=='featured' then
     local sameAccount=record.accountId and record.accountId~='' and record.accountId==other.accountId
     local legacyEmail=(not record.accountId or not other.accountId) and record.email and record.email~='' and other.email and string.lower(record.email)==string.lower(other.email)
     if sameAccount or legacyEmail then return -2 end
    end
   end
  end
 end
end
if ARGV[5]=='submission' and record.slug then
 local key='digivated:launch-slug:'..record.slug; local owner=redis.call('GET',key)
 if owner and owner~=id then return -1 end
 redis.call('SET',key,id)
end
if KEYS[5] and not redis.call('SET',KEYS[5],id,'NX') then return -3 end
redis.call('SET',KEYS[1],ARGV[2]); redis.call('ZADD',KEYS[2],ARGV[4],id)
if ARGV[3]~='' then redis.call('SET',KEYS[3],ARGV[3]); redis.call('ZADD',KEYS[4],ARGV[4],id)
else redis.call('DEL',KEYS[3]); redis.call('ZREM',KEYS[4],id) end
if ARGV[5]=='submission' and record.launch and record.launch.kind=='free' then
 if record.status=='pending' and record.launch.badgeVerifiedAt and record.launch.scheduledTimestamp then redis.call('ZADD','digivated:launch:free',record.launch.scheduledTimestamp,id)
 else redis.call('ZREM','digivated:launch:free',id) end
end
return 1`;
export async function saveRecord(redis, kind, input) {
  if (!validId(input.id)) throw new AdminError(400, 'Invalid identifier.');
  const raw = await redis(['GET', storageKey(kind, input.id)]);
  const record = validateEdit(kind, input, raw ? JSON.parse(raw) : null);
  const projection = kind === 'submission' ? projectPublic(record) : contentPublic(kind, record);
  const result = await redis(['EVAL', SAVE_EDIT, 4, storageKey(kind, input.id), indexKey(kind), `digivated:public:${kind}:${input.id}`, `digivated:public:${kind}s`, input.revision, JSON.stringify(record), projection ? JSON.stringify(projection) : '', Date.parse(record.date), kind]);
  if (result === -2) throw new AdminError(409, 'This owner already has a live project. Archive it before publishing another.');
  if (result !== 1) throw new AdminError(409, 'This item changed elsewhere. Reload it before saving.');
  return record;
}
export const LIST = `local ids=redis.call('ZREVRANGE',KEYS[1],ARGV[1],ARGV[2]); local rows={}; for _,id in ipairs(ids) do local raw=redis.call('GET',ARGV[3]..id); if raw then local r=cjson.decode(raw); r.hasImage=(r.image and r.image~='') and true or false; r.image=nil; r.content=nil; r.notes=nil; r.email=nil; if r.promotion then r.promotion.receiptReference=nil end; r.consentedAt=nil; r.consentVersion=nil; r.emailOutreachConsentedAt=nil; r.emailOutreachConsentVersion=nil; table.insert(rows,cjson.encode(r)) end end; return rows`;
export const launchStages = ['review', 'badge', 'scheduled', 'payment', 'spotlight'];

// Used by the queue filter and overview so counts match the records they open.
export const LAUNCH_STAGE_LUA = `
local function launchStage(r)
  if r.status ~= 'pending' then return '' end
  local promotion = type(r.promotion) == 'table' and r.promotion or {}
  if promotion.included == 'instant-launch' and promotion.verified ~= true then return 'payment' end
  if promotion.included == 'founding-membership' then return 'spotlight' end
  local launch = type(r.launch) == 'table' and r.launch or {}
  if launch.kind == 'free' then
    if type(launch.badgeVerifiedAt) == 'string' and launch.badgeVerifiedAt ~= '' then return 'scheduled' end
    return 'badge'
  end
  return 'review'
end
`;

export const LIST_FILTERED = `${LAUNCH_STAGE_LUA} local ids=redis.call('ZREVRANGE',KEYS[1],ARGV[1],ARGV[1]+249); local rows={}; local scanned=0; for _,id in ipairs(ids) do scanned=scanned+1; local raw=redis.call('GET',ARGV[2]..id); if raw then local ok,r=pcall(cjson.decode,raw); if ok and type(r)=='table' and (ARGV[3]=='' or r.status==ARGV[3]) and (not ARGV[4] or ARGV[4]=='' or launchStage(r)==ARGV[4]) then r.hasImage=(r.image and r.image~='') and true or false; r.image=nil; r.content=nil; r.notes=nil; r.email=nil; if r.promotion then r.promotion.receiptReference=nil end; r.consentedAt=nil; r.consentVersion=nil; r.emailOutreachConsentedAt=nil; r.emailOutreachConsentVersion=nil; table.insert(rows,cjson.encode(r)); if #rows==25 then break end end end end; if #rows==0 then return '{"rows":[],"scanned":'..scanned..'}' end; return cjson.encode({rows=rows,scanned=scanned})`;
export async function listRecords(redis, kind, offset = 0, status = '', stage = '') {
  const prefix = kind === 'submission' ? 'digivated:submission:' : `digivated:${kind}:`;
  if (status || stage) {
    const total=Number(await redis(['ZCARD',indexKey(kind)]));
    const items=[];let cursor=offset;
    while(cursor<total&&items.length<25){
      const data=JSON.parse(await redis(['EVAL',LIST_FILTERED,1,indexKey(kind),cursor,prefix,status,stage]));
      if(!data.scanned)break;
      cursor+=data.scanned;items.push(...data.rows.map(JSON.parse));
    }
    return {items:items.map(r=>kind==='submission'?{...r,pick:isDigivatedPick(r)}:r),next:cursor<total?cursor:null};
  }
  const rows = await redis(['EVAL', LIST, 1, indexKey(kind), offset, offset + 24, prefix]);
  return { items: rows.map(JSON.parse).map(r => kind === 'submission' ? {...r,pick:isDigivatedPick(r)} : r), next: rows.length === 25 ? offset + 25 : null };
}
export async function publicRecords(redis, kind, offset = 0, limit = 100) {
  const ids = await redis(['ZREVRANGE', `digivated:public:${kind}s`, offset, offset + limit - 1]);
  if (!ids.length) return [];
  const projections=await redis(['MGET', ...ids.map(id => `digivated:public:${kind}:${id}`)]);
  return (await redis(['MGET', ...ids.map(id => storageKey(kind,id))])).filter((raw,index)=>raw && projections[index]).map(JSON.parse).map(record => kind === 'submission' ? projectPublic(record) : contentPublic(kind,record)).filter(Boolean);
}


const ARCHIVE_DUPLICATE_PROJECTS = `
local ids=redis.call('ZRANGE',KEYS[1],0,-1)
local winners={}
local duplicates={}
for _,id in ipairs(ids) do
 local raw=redis.call('GET','digivated:submission:'..id)
 if raw then
  local row=cjson.decode(raw)
  if row.accountId and row.accountId~='' and (row.status=='approved' or row.status=='featured') then
   local rank=0
   if row.status=='featured' then rank=1 end
   if row.promotion and row.promotion.verified then rank=rank+2 end
   local winner=winners[row.accountId]
   if not winner or rank>winner.rank then
    if winner then table.insert(duplicates,winner.id) end
    winners[row.accountId]={id=id,rank=rank}
   else
    table.insert(duplicates,id)
   end
  end
 end
end
if ARGV[1]=='apply' then
 for _,id in ipairs(duplicates) do
  local key='digivated:submission:'..id
  local row=cjson.decode(redis.call('GET',key))
  row.status='archived'
  row.pagePublished=false
  row.revision=(row.revision or 0)+1
  redis.call('SET',key,cjson.encode(row))
  redis.call('DEL','digivated:public:submission:'..id)
  redis.call('ZREM',KEYS[1],id)
 end
end
return #duplicates`;

export async function archiveDuplicateProjects(redis, apply = false) {
  return Number(await redis(['EVAL', ARCHIVE_DUPLICATE_PROJECTS, 1, 'digivated:public:submissions', apply ? 'apply' : 'preview']));
}
