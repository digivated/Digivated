import {redisClient} from './submissions.mjs';
import {verifiedAccount} from './project-account.mjs';
import {projectPublic} from './admin-store.mjs';
import {safeUrl} from '../src/data/community.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const key=id=>`digivated:creator:profile:${id}`;
export function makeCreatorProfileHandler(deps={}){
 return async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(code,body)=>{res.statusCode=code;res.end(JSON.stringify(body));};
  try{
   const env=deps.env||process.env,url=new URL(req.url,'https://digivated.com');
   if(!deps.redis&&!env.SUBMISSIONS_REDIS_REST_TOKEN)return send(503,{error:'Profiles are temporarily unavailable.'});
   const redis=deps.redis||redisClient(env);
   if(req.method==='GET'&&url.searchParams.get('id')){
    const id=url.searchParams.get('id');if(!UUID.test(id))return send(404,{error:'Profile not found.'});
    const raw=await redis(['GET',key(id)]);if(!raw)return send(404,{error:'Profile not found.'});
    const profile=JSON.parse(raw);if(!profile.public)return send(404,{error:'Profile not found.'});
    const ids=await redis(['ZREVRANGE','digivated:public:submissions',0,499]);
    const records=ids.length?await redis(['MGET',...ids.map(item=>`digivated:submission:${item}`)]):[];
    const projects=records.filter(Boolean).flatMap(item=>{try{const record=JSON.parse(item);return record.accountId===id?[projectPublic(record)].filter(Boolean):[];}catch{return[];}}).slice(0,30);
    return send(200,{profile:{name:profile.name,bio:profile.bio,website:profile.website,id},projects});
   }
   if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed.'});
   const account=await(deps.verifyAccount||verifiedAccount)(req,env,deps.fetcher||fetch);if(!account)return send(401,{error:'Sign in to manage your profile.'});
   if(req.method==='GET'){
    const raw=await redis(['GET',key(account.id)]);
    return send(200,{profile:raw?JSON.parse(raw):{name:'',bio:'',website:'',public:false},id:account.id});
   }
   if(req.headers.origin!=='https://digivated.com'||req.headers['sec-fetch-site']==='cross-site'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(403,{error:'Open your account on Digivated.'});
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   const name=String(body?.name||'').trim(),bio=String(body?.bio||'').trim(),website=String(body?.website||'').trim();
   if(name.length<2||name.length>60||bio.length>240||website.length>300||website&&!safeUrl(website))return send(400,{error:'Check your name, bio and website URL.'});
   const profile={name,bio,website:website?safeUrl(website):'',public:body?.public===true,updatedAt:new Date().toISOString()};
   await redis(['SET',key(account.id),JSON.stringify(profile)]);
   return send(200,{profile,id:account.id});
  }catch{return send(503,{error:'Profile could not be loaded or saved. Try again shortly.'});}
 };
}
