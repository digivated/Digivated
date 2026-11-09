import {redisClient} from './submissions.mjs';
import {verifiedAccount} from './project-account.mjs';
import {projectPublic} from './admin-store.mjs';
import {safeUrl} from '../src/data/community.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const key=id=>`digivated:creator:profile:${id}`;
const publicIndex='digivated:creator:public';
const FOLLOW=`if redis.call('EXISTS',KEYS[3])==0 then return -1 end
local profile=cjson.decode(redis.call('GET',KEYS[3]));if profile.public~=true then return -1 end
if ARGV[1]=='follow' then redis.call('SADD',KEYS[1],ARGV[2]);redis.call('SADD',KEYS[2],ARGV[3]) else redis.call('SREM',KEYS[1],ARGV[2]);redis.call('SREM',KEYS[2],ARGV[3]) end
return redis.call('SCARD',KEYS[1])`;
export function makeCreatorProfileHandler(deps={}){
 return async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(code,body)=>{res.statusCode=code;res.end(JSON.stringify(body));};
  try{
   const env=deps.env||process.env,url=new URL(req.url,'https://digivated.com');
   if(!deps.redis&&!env.SUBMISSIONS_REDIS_REST_TOKEN)return send(503,{error:'Profiles are temporarily unavailable.'});
   const redis=deps.redis||redisClient(env);
   if(req.method==='GET'&&url.searchParams.get('action')==='discover'){
    const ids=await redis(['ZREVRANGE',publicIndex,0,99]);
    const rows=ids.length?await redis(['MGET',...ids.map(key)]):[];
    return send(200,{creators:rows.flatMap((raw,index)=>{try{const p=JSON.parse(raw);return p.public?[{id:ids[index],name:p.name,bio:p.bio}]:[];}catch{return[];}})});
   }
   if(req.method==='GET'&&url.searchParams.get('id')){
    const id=url.searchParams.get('id');if(!UUID.test(id))return send(404,{error:'Profile not found.'});
    const raw=await redis(['GET',key(id)]);if(!raw)return send(404,{error:'Profile not found.'});
    const profile=JSON.parse(raw);if(!profile.public)return send(404,{error:'Profile not found.'});
    const ids=await redis(['ZREVRANGE','digivated:public:submissions',0,499]);
    const records=ids.length?await redis(['MGET',...ids.map(item=>`digivated:submission:${item}`)]):[];
    const projects=records.filter(Boolean).flatMap(item=>{try{const record=JSON.parse(item);return record.accountId===id?[projectPublic(record)].filter(Boolean):[];}catch{return[];}}).slice(0,30);
    const followers=Number(await redis(['SCARD',`digivated:creator:followers:${id}`]))||0;
    const viewer=req.headers.authorization?await(deps.verifyAccount||verifiedAccount)(req,env,deps.fetcher||fetch):null;
    const following=viewer&&viewer.id!==id?Number(await redis(['SISMEMBER',`digivated:creator:followers:${id}`,viewer.id]))===1:false;
    return send(200,{profile:{name:profile.name,bio:profile.bio,website:profile.website,social:profile.social||'',id},projects,followers,following,ownProfile:viewer?.id===id});
   }
   if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed.'});
   const account=await(deps.verifyAccount||verifiedAccount)(req,env,deps.fetcher||fetch);if(!account)return send(401,{error:'Sign in to manage your profile.'});
   if(req.method==='GET'&&url.searchParams.get('action')==='feed'){
    const following=await redis(['SMEMBERS',`digivated:creator:following:${account.id}`]);
    if(!following.length)return send(200,{items:[]});
    const ids=await redis(['ZREVRANGE','digivated:public:submissions',0,499]);
    const records=ids.length?await redis(['MGET',...ids.map(item=>`digivated:submission:${item}`)]):[];
    const followSet=new Set(following);
    const items=records.filter(Boolean).flatMap(raw=>{try{const row=JSON.parse(raw);return followSet.has(row.accountId)?[projectPublic(row)].filter(Boolean):[];}catch{return[];}}).slice(0,20);
    return send(200,{items});
   }
   if(req.method==='GET'){
    const raw=await redis(['GET',key(account.id)]);
    if(raw){try{const saved=JSON.parse(raw);if(saved.public)await redis(['ZADD',publicIndex,Date.parse(saved.updatedAt)||Date.now(),account.id]);}catch{}}
    return send(200,{profile:raw?JSON.parse(raw):{name:'',bio:'',website:'',social:'',public:false},id:account.id,following:Number(await redis(['SCARD',`digivated:creator:following:${account.id}`]))||0});
   }
   if(req.headers.origin!=='https://digivated.com'||req.headers['sec-fetch-site']==='cross-site'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(403,{error:'Open your account on Digivated.'});
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(url.searchParams.get('action')==='follow'){
    const id=String(body?.id||'');if(!UUID.test(id)||id===account.id||!['follow','unfollow'].includes(body?.operation))return send(400,{error:'Choose a valid creator.'});
    const followers=await redis(['EVAL',FOLLOW,3,`digivated:creator:followers:${id}`,`digivated:creator:following:${account.id}`,key(id),body.operation,account.id,id]);
    return followers===-1?send(404,{error:'Creator profile not found.'}):send(200,{following:body.operation==='follow',followers:Number(followers)});
   }
   const name=String(body?.name||'').trim(),bio=String(body?.bio||'').trim(),website=String(body?.website||'').trim(),social=String(body?.social||'').trim();
   if(name.length<2||name.length>60||bio.length>240||website.length>300||website&&!safeUrl(website)||social.length>300||social&&!safeUrl(social))return send(400,{error:'Check your name, bio and links.'});
   const profile={name,bio,website:website?safeUrl(website):'',social:social?safeUrl(social):'',public:body?.public===true,updatedAt:new Date().toISOString()};
   await redis(['SET',key(account.id),JSON.stringify(profile)]);
   await redis([profile.public?'ZADD':'ZREM',publicIndex,...(profile.public?[Date.now(),account.id]:[account.id])]);
   return send(200,{profile,id:account.id});
  }catch{return send(503,{error:'Profile could not be loaded or saved. Try again shortly.'});}
 };
}
