import {createHash,randomUUID} from 'node:crypto';
import {AdminError} from './admin-auth.mjs';
export const NEWS='digivated:news:';
export const CATEGORIES=['ai-tech','markets','security'];
export const newsKey=id=>NEWS+'story:'+id;
const hash=value=>createHash('sha256').update(value).digest('hex');
const ID=/^[a-f0-9]{24}$/;
export const INSERT_NEWS=`
local previous=redis.call('GET',KEYS[2]) or redis.call('GET',KEYS[3])
if previous then return previous end
redis.call('SET',KEYS[1],ARGV[1],'EX',31536000)
redis.call('SET',KEYS[2],ARGV[2],'EX',31536000)
redis.call('SET',KEYS[3],ARGV[2],'EX',604800)
redis.call('ZADD',KEYS[4],ARGV[3],ARGV[2])
redis.call('ZADD',KEYS[5],ARGV[3],ARGV[2])
if ARGV[4]=='published' then redis.call('SET',KEYS[6],ARGV[5],'EX',31536000) end
redis.call('LPUSH',KEYS[7],ARGV[6]);redis.call('LTRIM',KEYS[7],0,49);redis.call('EXPIRE',KEYS[7],31536000)
return 'inserted'`;
export const EDIT_NEWS=`
local raw=redis.call('GET',KEYS[1]);if not raw then return -1 end
local old=cjson.decode(raw);if old.revision~=tonumber(ARGV[1]) then return -2 end
redis.call('SET',KEYS[1],ARGV[2],'EX',31536000);redis.call('ZREM',KEYS[2],ARGV[3]);redis.call('ZREM',KEYS[3],ARGV[3]);redis.call('ZREM',KEYS[4],ARGV[3])
redis.call('ZADD',KEYS[5],ARGV[4],ARGV[3]);
if ARGV[5]=='published' then redis.call('SET',KEYS[6],ARGV[6],'EX',31536000) else redis.call('DEL',KEYS[6]) end
redis.call('LPUSH',KEYS[7],ARGV[7]);redis.call('LTRIM',KEYS[7],0,49);redis.call('EXPIRE',KEYS[7],31536000)
return 1`;
export function projection(record){
 return Object.fromEntries(['id','headline','summary','category','classification','sourceName','sourceUrl','sourcePublishedAt','publishedAt','verifiedAt','importance','summaryMethod','updatedAt','sourceType','tickers'].map(key=>[key,record[key]]));
}
export async function insertNews(redis,candidate,assessment,now=Date.now()){
 const canonical=new URL(candidate.sourceUrl);canonical.hash='';for(const key of [...canonical.searchParams.keys()])if(/^(utm_|fbclid|gclid)/i.test(key))canonical.searchParams.delete(key);
 const id=hash(canonical.href).slice(0,24),at=new Date(now).toISOString();
 const status=assessment.decision==='publish'?'published':'review';
 const record={id,sourceType:candidate.sourceType||'official-publisher',tickers:candidate.evidence?.verified===true?(candidate.tickers||[]).slice(0,8):[],headline:String(candidate.headline).slice(0,240),summary:assessment.summary||'',category:candidate.category,classification:assessment.classification||'update',sourceId:candidate.sourceId,sourceName:candidate.sourceName,sourceUrl:canonical.href,sourcePublishedAt:candidate.sourcePublishedAt,sourceText:String(candidate.sourceText||'').slice(0,16000),feedSummary:String(candidate.feedSummary||'').slice(0,2000),evidence:candidate.evidence||{},sourceHash:candidate.evidence?.contentHash||hash(candidate.sourceText||''),verifiedAt:candidate.evidence?.checkedAt||null,publishedAt:status==='published'?at:null,createdAt:at,updatedAt:at,revision:0,status,autoPublished:status==='published'&&!assessment.editorialReview,summaryMethod:assessment.summaryMethod||'source-extract',importance:assessment.importance||0,reasons:assessment.reasons||[],eventKey:assessment.eventKey||hash(candidate.category+':'+candidate.headline.toLowerCase().replace(/[^a-z0-9]/g,'')),original:{headline:candidate.headline,sourceUrl:canonical.href,sourcePublishedAt:candidate.sourcePublishedAt,summary:assessment.summary||''}};
 const eventKey=hash(record.eventKey);const audit={at,operation:status==='published'?(assessment.editorialReview?'editorial-publish':'auto-publish'):'queue-review',revision:0,reasons:record.reasons,snapshot:projection(record),evidence:record.evidence};
 const result=await redis(['EVAL',INSERT_NEWS,7,newsKey(id),NEWS+'url:'+hash(canonical.href),NEWS+'event:'+eventKey,NEWS+'index:'+status,NEWS+'index:all',NEWS+'public:'+id,NEWS+'audit:'+id,JSON.stringify(record),id,Date.parse(record.sourcePublishedAt)||now,status,JSON.stringify(projection(record)),JSON.stringify(audit)]);
 return {inserted:result==='inserted',id:result==='inserted'?id:result,status};
}
export async function listNewsRecords(redis,{status='review',cursor=0,limit=20}={}){
 if(!['review','published','removed','all'].includes(status)||!Number.isInteger(Number(cursor))||Number(cursor)<0||Number(cursor)>100000)throw new AdminError(400,'Choose a valid news filter.');
 const ids=await redis(['ZREVRANGE',NEWS+'index:'+status,Number(cursor),Number(cursor)+limit]);
 const selected=ids.slice(0,limit);const rows=selected.length?await redis(['MGET',...selected.map(newsKey)]):[];
 return {items:rows.filter(Boolean).map(JSON.parse),next:ids.length>limit?String(Number(cursor)+limit):null};
}
export async function getNewsRecord(redis,id){
 if(!ID.test(id||''))throw new AdminError(400,'Choose a valid story.');
 const raw=await redis(['GET',newsKey(id)]);if(!raw)throw new AdminError(404,'Story not found.');
 return {record:JSON.parse(raw),audit:(await redis(['LRANGE',NEWS+'audit:'+id,0,49])).map(JSON.parse)};
}
export async function saveNewsRecord(redis,input,now=Date.now()){
 if(!input||!ID.test(input.id||'')||!Number.isInteger(input.revision))throw new AdminError(400,'Reload the story before saving.');
 const {record:old}=await getNewsRecord(redis,input.id);
 const headline=String(input.headline||'').trim(),summary=String(input.summary||'').trim(),note=String(input.reviewNote||'').trim();
 if(headline.length<8||headline.length>240||(input.status==='published'&&summary.length<20)||summary.length>900||note.length>1200||!CATEGORIES.includes(input.category)||!['published','review','removed'].includes(input.status)||!['breaking','update'].includes(input.classification))throw new AdminError(400,'Check the headline, summary, category and status.');
 if(input.status==='published'&&(!input.verificationConfirmed||note.length<8))throw new AdminError(400,'Confirm the source and add a short review note before publishing.');
 const sourcePublishedAt=typeof input.sourcePublishedAt==='string'&&input.sourcePublishedAt.trim()?input.sourcePublishedAt.trim():old.sourcePublishedAt;
 const sourceTime=Date.parse(sourcePublishedAt);if(input.status==='published'&&(!Number.isFinite(sourceTime)||sourceTime>now))throw new AdminError(400,'The original source publication time must be verified before publishing.');
 const at=new Date(now).toISOString();
 const record={...old,headline,summary,sourcePublishedAt,ownerVerified:input.status==='published'&&input.verificationConfirmed,summaryMethod:summary!==old.summary?'owner-edited':old.summaryMethod,category:input.category,status:input.status,classification:input.classification==='breaking'&&now-sourceTime<=6*3600000?'breaking':'update',reviewNote:note,revision:old.revision+1,updatedAt:at,verifiedAt:input.verificationConfirmed?at:old.verifiedAt,publishedAt:input.status==='published'?(old.publishedAt||at):old.publishedAt,autoPublished:false};
 const audit={at,operation:input.status==='removed'?'remove':input.status==='published'?'owner-publish':'owner-edit',revision:record.revision,note,before:projection(old),after:projection(record)};
 const result=await redis(['EVAL',EDIT_NEWS,7,newsKey(record.id),NEWS+'index:review',NEWS+'index:published',NEWS+'index:removed',NEWS+'index:'+record.status,NEWS+'public:'+record.id,NEWS+'audit:'+record.id,input.revision,JSON.stringify(record),record.id,Number.isFinite(sourceTime)?sourceTime:Date.parse(old.createdAt),record.status,JSON.stringify(projection(record)),JSON.stringify(audit)]);
 if(result!==1)throw new AdminError(result===-1?404:409,result===-1?'Story no longer exists.':'Another update changed this story. Reload before saving.');
 return record;
}
export async function newsStatus(redis){
 const raw=await redis(['GET',NEWS+'latest']);const report=raw?JSON.parse(raw):null;
 return {paused:await redis(['GET',NEWS+'paused'])==='1',status:report?.status||'not-run',lastCheckedAt:report?.finishedAt||null,report};
}
export async function setNewsPaused(redis,paused){if(typeof paused!=='boolean')throw new AdminError(400,'Choose pause or resume.');await redis(['SET',NEWS+'paused',paused?'1':'0']);return {ok:true,paused};}
export const lockLease=()=>randomUUID();
