import { indexKey, storageKey } from './admin-store.mjs';

// Aggregate inside Redis so images, contact information and notes never cross
// this boundary. Bound each Lua execution to 250 records.
export const OVERVIEW_BATCH = `local ids=redis.call('ZREVRANGE',KEYS[1],ARGV[1],ARGV[2]); local rows={}; for _,id in ipairs(ids) do local raw=redis.call('GET',ARGV[3]..id); if raw then local ok,r=pcall(cjson.decode,raw); if ok and type(r)=='table' then table.insert(rows,{status=r.status or 'unknown',date=r.date or ''}) end end end; return cjson.encode(rows)`;
async function summary(redis, index, prefix, days) {
  const total=Number(await redis(['ZCARD',index]));
  const result={total:0,statuses:Object.create(null),activity:days.map(date=>({date,count:0}))};
  for(let offset=0;offset<total;offset+=250){
    const raw=await redis(['EVAL',OVERVIEW_BATCH,1,index,offset,offset+249,prefix]);
    const rows=typeof raw==='string'?JSON.parse(raw):raw;
    for(const row of Array.isArray(rows)?rows:[]){
      result.total++;result.statuses[row.status]=(result.statuses[row.status]||0)+1;
      const day=result.activity.find(day=>day.date===String(row.date||'').slice(0,10));if(day)day.count++;
    }
  }
  return result;
}
export async function adminOverview(redis, now=new Date()){
  const day=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  const days=Array.from({length:7},(_,i)=>new Date(day-(6-i)*86400000).toISOString().slice(0,10));
  const [submissions,articles,products,comments,carousels,newsPublished,newsReview]=await Promise.all([
    ...['submission','resource','product'].map(kind=>summary(redis,indexKey(kind),storageKey(kind,''),days)),
    summary(redis,'digivated:card:comments:all','digivated:card:comment:',days),
    redis(['ZCARD','digivated:carousel:index']),redis(['ZCARD','digivated:news:index:published']),redis(['ZCARD','digivated:news:index:review'])
  ]);
  return {generatedAt:now.toISOString(),submissions,articles,products,comments,carousels:Number(carousels),news:{published:Number(newsPublished),review:Number(newsReview)}};
}
