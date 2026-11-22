import {redisClient} from './submissions.mjs';
import {verifiedAccount} from './project-account.mjs';
import {randomUUID} from 'node:crypto';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const profileKey=id=>`digivated:creator:profile:${id}`;
const pair=(a,b)=>[a,b].sort().join(':');
const threadKey=id=>`digivated:creator:dm:${id}`;
const messageKey=id=>`digivated:creator:message:${id}`;
const blockKey=id=>`digivated:creator:blocked:${id}`;
const noLinks=text=>!/(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|net|io|ai|app|dev|co|xyz|gg|link|site|me|sh|ly|to)\b)/i.test(text);
export function makeCreatorInboxHandler(deps={}){return async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 try{
  const env=deps.env||process.env;if(!deps.redis&&!env.SUBMISSIONS_REDIS_REST_TOKEN)return send(503,{error:'Inbox is temporarily unavailable.'});
  const redis=deps.redis||redisClient(env),account=await(deps.verifyAccount||verifiedAccount)(req,env,deps.fetcher||fetch);if(!account)return send(401,{error:'Sign in to use your inbox.'});
  const url=new URL(req.url,'https://digivated.com'),action=url.searchParams.get('action')||'list';
  if(req.method==='GET'&&action==='list'){
   const ids=await redis(['ZREVRANGE',`digivated:creator:inbox:${account.id}`,0,99]);
   const contacts=ids.map(id=>id.split(':').find(part=>part!==account.id)).filter(id=>UUID.test(id));
   const profiles=contacts.length?await redis(['MGET',...contacts.map(profileKey)]):[];
   const rows=await Promise.all(ids.map(async(id,i)=>{const contact=contacts[i];if(!contact)return null;const p=profiles[i]?JSON.parse(profiles[i]):null;if(!p?.public)return null;const last=await redis(['ZREVRANGE',threadKey(id),0,0]);const msg=last.length?await redis(['GET',messageKey(last[0])]):null;const item=msg?JSON.parse(msg):null;return{id:contact,name:p.name,logoUrl:p.hasLogo?`/api/creator-profile?logo=${contact}`:'',preview:item?.body||'',updatedAt:item?.createdAt||'',unread:Number(await redis(['GET',`digivated:creator:unread:${account.id}:${id}`]))||0,blocked:Number(await redis(['SISMEMBER',blockKey(account.id),contact]))===1};}));
   return send(200,{conversations:rows.filter(Boolean)});
  }
  if(req.method==='GET'&&action==='thread'){
   const other=url.searchParams.get('id');if(!UUID.test(other)||other===account.id)return send(400,{error:'Choose a creator.'});
   const pRaw=await redis(['GET',profileKey(other)]),p=pRaw?JSON.parse(pRaw):null;if(!p?.public)return send(404,{error:'Creator not found.'});
   const id=pair(account.id,other),ids=await redis(['ZRANGE',threadKey(id),-100,-1]),rows=ids.length?await redis(['MGET',...ids.map(messageKey)]):[];
   await redis(['DEL',`digivated:creator:unread:${account.id}:${id}`]);
   return send(200,{contact:{id:other,name:p.name,logoUrl:p.hasLogo?`/api/creator-profile?logo=${other}`:'',blocked:Number(await redis(['SISMEMBER',blockKey(account.id),other]))===1},messages:rows.filter(Boolean).map(raw=>JSON.parse(raw)).map(({id,from,body,createdAt})=>({id,from,body,createdAt}))});
  }
  if(req.method!=='POST')return send(405,{error:'Method not allowed.'});
  if(req.headers.origin!=='https://digivated.com'||req.headers['sec-fetch-site']==='cross-site'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(403,{error:'Open your inbox on Digivated.'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body,other=String(body?.to||'');if(!UUID.test(other)||other===account.id)return send(400,{error:'Choose a creator.'});
  if(action==='block'){const op=body?.operation;if(!['block','unblock'].includes(op))return send(400,{error:'Choose a valid action.'});await redis([op==='block'?'SADD':'SREM',blockKey(account.id),other]);return send(200,{blocked:op==='block'});}
  if(action!=='send')return send(400,{error:'Unknown inbox action.'});
  const senderRaw=await redis(['GET',profileKey(account.id)]),recipientRaw=await redis(['GET',profileKey(other)]),sender=senderRaw?JSON.parse(senderRaw):null,recipient=recipientRaw?JSON.parse(recipientRaw):null;
  if(!sender?.public||!recipient?.public)return send(403,{error:'Both creators need public profiles to message.'});
  if(Number(await redis(['SISMEMBER',blockKey(other),account.id]))===1||Number(await redis(['SISMEMBER',blockKey(account.id),other]))===1)return send(403,{error:'This conversation is unavailable.'});
  const text=String(body?.body||'').trim();if(text.length<1||text.length>1000||/[\u0000-\u001f\u007f]/.test(text)||!noLinks(text))return send(400,{error:'Write a message under 1,000 characters without links.'});
  const rate=Number(await redis(['EVAL',"local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],3600) end;return n",1,`digivated:creator:dm-rate:${account.id}`]));if(rate>30)return send(429,{error:'You reached the hourly message limit.'});
  const id=randomUUID(),createdAt=new Date().toISOString(),msg={id,from:account.id,to:other,body:text,createdAt},thread=pair(account.id,other),now=Date.now();
  await redis(['SET',messageKey(id),JSON.stringify(msg)]);await redis(['ZADD',threadKey(thread),now,id]);await redis(['ZADD',`digivated:creator:inbox:${account.id}`,now,thread]);await redis(['ZADD',`digivated:creator:inbox:${other}`,now,thread]);await redis(['INCR',`digivated:creator:unread:${other}:${thread}`]);
  return send(201,{message:{id,from:account.id,body:text,createdAt}});
 }catch{return send(503,{error:'Inbox is temporarily unavailable. Try again shortly.'});}
};}
