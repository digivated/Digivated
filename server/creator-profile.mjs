import {redisClient} from './submissions.mjs';
import {verifiedAccount} from './project-account.mjs';
import {projectPublic} from './admin-store.mjs';
import {safeUrl} from '../src/data/community.mjs';
import {imageBytes} from './member-community.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const key=id=>`digivated:creator:profile:${id}`;
const logoKey=id=>`digivated:creator:logo:${id}`;
const publicIndex='digivated:creator:public';
const postIndex='digivated:creator:posts';
const postKey=id=>`digivated:creator:post:${id}`;
const MEDIA_TYPES={'image/jpeg':{ext:'jpg',max:3145728},'image/png':{ext:'png',max:3145728},'image/webp':{ext:'webp',max:3145728},'video/mp4':{ext:'mp4',max:12582912},'video/webm':{ext:'webm',max:12582912}};
const mediaUrl=(env,path)=>`${new URL(env.COMMUNITY_SUPABASE_URL).origin}/storage/v1/object/public/creator-media/${path}`;
const likeKey=id=>`digivated:creator:likes:${id}`;
const savedKey=id=>`digivated:creator:saved:${id}`;
const REACT=`if redis.call('EXISTS',KEYS[1])==0 then return -1 end
local post=cjson.decode(redis.call('GET',KEYS[1]));if post.hidden then return -1 end
local exists=redis.call('SISMEMBER',KEYS[2],ARGV[1]);if exists==1 then redis.call('SREM',KEYS[2],ARGV[1]) else redis.call('SADD',KEYS[2],ARGV[1]) end
return redis.call('SCARD',KEYS[2])`;
const postRate=`local prior=redis.call('GET',KEYS[1]);if prior then return 1 end
local daily=redis.call('INCR',KEYS[2]);if daily==1 then redis.call('EXPIRE',KEYS[2],86400) end
if daily>30 then return 2 end
if redis.call('EXISTS',KEYS[3])==1 then return 3 end
redis.call('SET',KEYS[1],'1','EX',30);redis.call('SET',KEYS[3],'1','EX',86400);return 0`;
const hasLink=text=>/(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|net|io|ai|app|dev|co|xyz|gg|link|site|me|sh|ly|to)\b)/i.test(text);
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
   if(req.method==='GET'&&url.searchParams.get('logo')){
    const id=url.searchParams.get('logo');if(!UUID.test(id))return send(404,{error:'Logo not found.'});
    const raw=await redis(['GET',key(id)]);if(!raw)return send(404,{error:'Logo not found.'});
    const profile=JSON.parse(raw);
    if(!profile.public){const owner=req.headers.authorization?await(deps.verifyAccount||verifiedAccount)(req,env,deps.fetcher||fetch):null;if(owner?.id!==id)return send(404,{error:'Logo not found.'});}
    const image=await redis(['GET',logoKey(id)]);if(!image)return send(404,{error:'Logo not found.'});
    const {bytes,type}=imageBytes(image);res.setHeader('Content-Type',type);res.statusCode=200;return res.end(bytes);
   }
   if(req.method==='GET'&&url.searchParams.get('action')==='discover'){
    const ids=await redis(['ZREVRANGE',publicIndex,0,99]);
    const rows=ids.length?await redis(['MGET',...ids.map(key)]):[];
    return send(200,{creators:rows.flatMap((raw,index)=>{try{const p=JSON.parse(raw);return p.public?[{id:ids[index],name:p.name,bio:p.bio,logoUrl:p.hasLogo?`/api/creator-profile?logo=${ids[index]}`:''}]:[];}catch{return[];}})});
   }
   if(req.method==='GET'&&url.searchParams.get('action')==='posts'){
    const parent=url.searchParams.get('parent'),author=url.searchParams.get('author'),single=url.searchParams.get('post'),saved=url.searchParams.get('saved')==='1',offset=Number(url.searchParams.get('offset')||0);
    if(parent&&!UUID.test(parent)||author&&!UUID.test(author)||single&&!UUID.test(single)||!Number.isInteger(offset)||offset<0||offset>1000)return send(400,{error:'Invalid feed request.'});
    const viewer=req.headers.authorization?await(deps.verifyAccount||verifiedAccount)(req,env,deps.fetcher||fetch):null;
    if(saved&&!viewer)return send(401,{error:'Sign in to see saved posts.'});
    const index=parent?`digivated:creator:replies:${parent}`:author?`digivated:creator:author:${author}`:postIndex;
    const savedIds=saved?await redis(['SMEMBERS',savedKey(viewer.id)]):null;
    const ids=single?[single]:saved?(savedIds||[]).slice(offset,offset+50):await redis(['ZREVRANGE',index,offset,offset+49]);
    const raws=ids.length?await redis(['MGET',...ids.map(postKey)]):[];
    const posts=raws.filter(Boolean).flatMap(raw=>{try{const post=JSON.parse(raw);return !post.hidden&&(!author||post.authorId===author)?[post]:[];}catch{return[];}});
    const authorIds=[...new Set(posts.map(post=>post.authorId))];
    const profiles=authorIds.length?await redis(['MGET',...authorIds.map(key)]):[];
    const people=new Map(authorIds.map((id,i)=>{try{return[id,JSON.parse(profiles[i])];}catch{return[id,null];}}));
    const viewerSaved=viewer?new Set(savedIds||await redis(['SMEMBERS',savedKey(viewer.id)])):new Set();
    const publicPosts=posts.filter(post=>people.get(post.authorId)?.public);
    const enriched=await Promise.all(publicPosts.map(async post=>({id:post.id,body:post.body,media:post.media&&env.COMMUNITY_SUPABASE_URL?{type:post.media.type,url:mediaUrl(env,post.media.path)}:null,createdAt:post.createdAt,parentId:post.parentId||null,replies:post.replies||0,likes:Number(await redis(['SCARD',likeKey(post.id)]))||0,liked:viewer?Number(await redis(['SISMEMBER',likeKey(post.id),viewer.id]))===1:false,saved:viewerSaved.has(post.id),author:{id:post.authorId,name:people.get(post.authorId).name,logoUrl:people.get(post.authorId).hasLogo?`/api/creator-profile?logo=${post.authorId}`:''}})));
    return send(200,{posts:saved?enriched.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)):enriched,next:ids.length===50?offset+50:null});
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
    return send(200,{profile:{name:profile.name,bio:profile.bio,website:profile.website,social:profile.social||'',logoUrl:profile.hasLogo?`/api/creator-profile?logo=${id}`:'',id},projects,followers,following,ownProfile:viewer?.id===id});
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
    return send(200,{profile:raw?JSON.parse(raw):{name:'',bio:'',website:'',social:'',public:false},id:account.id,following:Number(await redis(['SCARD',`digivated:creator:following:${account.id}`]))||0,followingIds:await redis(['SMEMBERS',`digivated:creator:following:${account.id}`])});
   }
   if(req.headers.origin!=='https://digivated.com'||req.headers['sec-fetch-site']==='cross-site'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(403,{error:'Open your account on Digivated.'});
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(url.searchParams.get('action')==='media-ticket'){
    const type=String(body?.type||''),size=Number(body?.size),format=MEDIA_TYPES[type];
    if(!format||!Number.isInteger(size)||size<12||size>format.max)return send(400,{error:'Choose an image under 3 MB or an MP4/WebM video under 12 MB.'});
    const profile=await redis(['GET',key(account.id)]);if(!profile||!JSON.parse(profile).public)return send(403,{error:'Make your creator profile public before uploading.'});
    if(!env.COMMUNITY_SUPABASE_URL||!env.COMMUNITY_SUPABASE_SECRET_KEY)return send(503,{error:'Media uploads are temporarily unavailable.'});
    const count=Number(await redis(['EVAL',"local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],3600) end;return n",1,`digivated:creator:uploads:${account.id}`]));
    if(count>12)return send(429,{error:'You reached the hourly upload limit.'});
    const path=`${account.id}/${randomUUID()}.${format.ext}`;
    const client=deps.storageClient||createClient(env.COMMUNITY_SUPABASE_URL,env.COMMUNITY_SUPABASE_SECRET_KEY,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
    const {data,error}=await client.storage.from('creator-media').createSignedUploadUrl(path);
    if(error||!data?.token)return send(503,{error:'Could not prepare your upload. Try again.'});
    await redis(['SET',`digivated:creator:pending-media:${path}`,JSON.stringify({type,size}), 'EX',3600]);
    return send(200,{path,token:data.token});
   }
   if(url.searchParams.get('action')==='react'){
    const id=String(body?.id||''),kind=body?.kind;if(!UUID.test(id)||!['like','save'].includes(kind))return send(400,{error:'Choose a post and action.'});
    const raw=await redis(['GET',postKey(id)]),post=raw?JSON.parse(raw):null,profile=post?await redis(['GET',key(post.authorId)]):null;
    if(!post||post.hidden||!profile||!JSON.parse(profile).public)return send(404,{error:'Post not found.'});
    const count=Number(await redis(['EVAL',REACT,2,postKey(id),kind==='like'?likeKey(id):savedKey(account.id),kind==='like'?account.id:id]));
    if(count<0)return send(404,{error:'Post not found.'});
    const active=Number(await redis(['SISMEMBER',kind==='like'?likeKey(id):savedKey(account.id),kind==='like'?account.id:id]))===1;
    return send(200,{active,...(kind==='like'?{likes:count}:{})});
   }
   if(url.searchParams.get('action')==='post'){
    const profileRaw=await redis(['GET',key(account.id)]),profile=profileRaw?JSON.parse(profileRaw):null;
    if(!profile?.public)return send(403,{error:'Make your creator profile public before posting.'});
    const content=String(body?.body||'').trim(),parentId=body?.parentId||null;
    if(content.length<2||content.length>280||/[\u0000-\u001f\u007f]/.test(content)||hasLink(content))return send(400,{error:'Write 2–280 characters without links. Share project links through your profile.'});
    if(parentId){if(!UUID.test(parentId))return send(400,{error:'This conversation is unavailable.'});const parentRaw=await redis(['GET',postKey(parentId)]),parent=parentRaw?JSON.parse(parentRaw):null,parentProfile=parent?await redis(['GET',key(parent.authorId)]):null;if(!parent||parent.hidden||parent.parentId||!parentProfile||!JSON.parse(parentProfile).public)return send(400,{error:'This conversation is unavailable.'});}
    let media=null;
    if(body?.mediaPath){const path=String(body.mediaPath);if(!new RegExp(`^${account.id}/[a-f0-9-]{36}\\.(?:jpg|png|webp|mp4|webm)$`,'i').test(path))return send(400,{error:'Choose media from your own upload.'});const pending=await redis(['GET',`digivated:creator:pending-media:${path}`]);if(!pending)return send(400,{error:'This upload expired. Choose your file again.'});const expected=JSON.parse(pending),format=MEDIA_TYPES[expected.type];if(!format||!env.COMMUNITY_SUPABASE_URL||!env.COMMUNITY_SUPABASE_SECRET_KEY)return send(503,{error:'Media is unavailable.'});const client=deps.storageClient||createClient(env.COMMUNITY_SUPABASE_URL,env.COMMUNITY_SUPABASE_SECRET_KEY,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}}),result=await client.storage.from('creator-media').info(path);if(result.error||!result.data||result.data.size>format.max||result.data.size<12||result.data.contentType!==expected.type)return send(400,{error:'Upload could not be verified. Choose the file again.'});media={path,type:expected.type};}
    const hash=createHash('sha256').update(content.toLowerCase()).digest('hex');
    const rate=Number(await redis(['EVAL',postRate,3,`digivated:creator:rate:${account.id}`,`digivated:creator:daily:${account.id}`,`digivated:creator:duplicate:${account.id}:${hash}`]));
    if(rate)return send(429,{error:rate===1?'Wait a moment before posting again.':rate===2?'You reached today’s posting limit.':'You already shared this recently.'});
    const id=randomUUID(),createdAt=new Date().toISOString(),post={id,authorId:account.id,body:content,media,createdAt,parentId,replies:0};
    await redis(['SET',postKey(id),JSON.stringify(post)]);
    if(media)await redis(['DEL',`digivated:creator:pending-media:${media.path}`]);
    await redis(['ZADD',parentId?`digivated:creator:replies:${parentId}`:postIndex,Date.now(),id]);
    if(!parentId)await redis(['ZADD',`digivated:creator:author:${account.id}`,Date.now(),id]);
    if(parentId){const raw=await redis(['GET',postKey(parentId)]);if(raw){const parent=JSON.parse(raw);parent.replies=(parent.replies||0)+1;await redis(['SET',postKey(parentId),JSON.stringify(parent)]);}}
    return send(201,{post:{...post,media:media?{type:media.type,url:mediaUrl(env,media.path)}:null,author:{id:account.id,name:profile.name,logoUrl:profile.hasLogo?`/api/creator-profile?logo=${account.id}`:''}}});
   }
   if(url.searchParams.get('action')==='delete-post'){
    const id=String(body?.id||'');if(!UUID.test(id))return send(400,{error:'Choose a post.'});
    const raw=await redis(['GET',postKey(id)]);if(!raw)return send(404,{error:'Post not found.'});
    const post=JSON.parse(raw);if(post.authorId!==account.id)return send(403,{error:'You can only remove your own posts.'});
    post.hidden=true;await redis(['SET',postKey(id),JSON.stringify(post)]);
    if(post.media?.path&&env.COMMUNITY_SUPABASE_URL&&env.COMMUNITY_SUPABASE_SECRET_KEY){try{const client=deps.storageClient||createClient(env.COMMUNITY_SUPABASE_URL,env.COMMUNITY_SUPABASE_SECRET_KEY,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});await client.storage.from('creator-media').remove([post.media.path]);}catch{}}
    return send(200,{removed:true});
   }
   if(url.searchParams.get('action')==='logo'){
    const {bytes}=imageBytes(body?.image);
    if(bytes.length>180000)return send(400,{error:'Choose a smaller logo image.'});
    const previous=await redis(['GET',key(account.id)]);if(!previous)return send(400,{error:'Save your profile before uploading a logo.'});
    const profile={...JSON.parse(previous),hasLogo:true,updatedAt:new Date().toISOString()};
    await redis(['SET',logoKey(account.id),body.image]);await redis(['SET',key(account.id),JSON.stringify(profile)]);
    return send(200,{logoUrl:`/api/creator-profile?logo=${account.id}`});
   }
   if(url.searchParams.get('action')==='follow'){
    const id=String(body?.id||'');if(!UUID.test(id)||id===account.id||!['follow','unfollow'].includes(body?.operation))return send(400,{error:'Choose a valid creator.'});
    const followers=await redis(['EVAL',FOLLOW,3,`digivated:creator:followers:${id}`,`digivated:creator:following:${account.id}`,key(id),body.operation,account.id,id]);
    return followers===-1?send(404,{error:'Creator profile not found.'}):send(200,{following:body.operation==='follow',followers:Number(followers)});
   }
   const name=String(body?.name||'').trim(),bio=String(body?.bio||'').trim(),website=String(body?.website||'').trim(),social=String(body?.social||'').trim();
   if(name.length<2||name.length>60||bio.length>240||website.length>300||website&&!safeUrl(website)||social.length>300||social&&!safeUrl(social))return send(400,{error:'Check your name, bio and links.'});
   const previous=await redis(['GET',key(account.id)]);
   const profile={name,bio,website:website?safeUrl(website):'',social:social?safeUrl(social):'',public:body?.public===true,hasLogo:previous?!!JSON.parse(previous).hasLogo:false,updatedAt:new Date().toISOString()};
   await redis(['SET',key(account.id),JSON.stringify(profile)]);
   await redis([profile.public?'ZADD':'ZREM',publicIndex,...(profile.public?[Date.now(),account.id]:[account.id])]);
   return send(200,{profile,id:account.id});
  }catch(error){return send(error?.status||503,{error:error?.status===400?error.message:'Profile could not be loaded or saved. Try again shortly.'});}
 };
}
