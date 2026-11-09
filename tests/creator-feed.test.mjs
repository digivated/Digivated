import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCreatorProfileHandler} from '../server/creator-profile.mjs';

const alice='123e4567-e89b-42d3-a456-426614174000',bob='123e4567-e89b-42d3-a456-426614174001';
function fixture(options={}){
 const values=new Map(),sets=new Map(),members=new Map();
 const redis=async([command,...args])=>{
  if(command==='GET')return values.get(args[0])??null;
  if(command==='SET'){values.set(args[0],args[1]);return 'OK';}
  if(command==='DEL'){values.delete(args[0]);return 1;}
  if(command==='INCR'){const n=Number(values.get(args[0])||0)+1;values.set(args[0],n);return n;}
  if(command==='ZADD'){const items=sets.get(args[0])||[];items.unshift(args[2]);sets.set(args[0],items);return 1;}
  if(command==='ZREM')return 1;
  if(command==='ZREVRANGE')return(sets.get(args[0])||[]).slice(Number(args[1]),Number(args[2])+1);
  if(command==='MGET')return args.map(key=>values.get(key)||null);
  if(command==='SCARD')return (members.get(args[0])||new Set()).size;
  if(command==='SMEMBERS')return [...(members.get(args[0])||new Set())];
  if(command==='SISMEMBER')return (members.get(args[0])||new Set()).has(args[1])?1:0;
  if(command==='EVAL'&&args[1]===1){const key=args[2];const n=Number(values.get(key)||0)+1;values.set(key,n);return n;}
  if(command==='EVAL'&&args[1]===2){const [,count,postKey,setKey,member]=args;if(!values.has(postKey))return -1;const group=members.get(setKey)||new Set();if(group.has(member))group.delete(member);else group.add(member);members.set(setKey,group);return group.size;}
  if(command==='EVAL'){const [,count,wait,daily,duplicate]=args;assert.equal(count,3);if(values.has(wait))return 1;const n=Number(values.get(daily)||0)+1;values.set(daily,n);if(n>30)return 2;if(values.has(duplicate))return 3;values.set(wait,'1');values.set(duplicate,'1');return 0;}
  throw Error(command);
 };
 const handler=makeCreatorProfileHandler({redis,env:options.env||{},storageClient:options.storageClient,verifyAccount:async req=>req.headers.authorization?{id:req.headers.authorization==='Alice'?alice:bob}:null});
 const call=async(method,url,body,actor)=>{let raw;const res={setHeader(){},end(value){raw=value;}};await handler({method,url,body,headers:{origin:'https://digivated.com','content-type':'application/json',...(actor?{authorization:actor}:{})}},res);return{status:res.statusCode,...JSON.parse(raw)};};
 return{call,values};
}
test('creator conversation requires a public profile and blocks links and fast repeated posts',async()=>{
 const {call,values}=fixture();
 assert.equal((await call('POST','/?action=post',{body:'Hello builders'},'Alice')).status,403);
 await call('POST','/',{name:'Alice',public:true},'Alice');
 assert.equal((await call('POST','/?action=post',{body:'Visit https://spam.example'},'Alice')).status,400);
 const first=await call('POST','/?action=post',{body:'What are you building today?'},'Alice');assert.equal(first.status,201);
 assert.equal((await call('POST','/?action=post',{body:'Another message'},'Alice')).status,429);
 const publicFeed=await call('GET','/?action=posts');assert.equal(publicFeed.posts.length,1);assert.equal(publicFeed.posts[0].author.name,'Alice');
 values.delete('digivated:creator:rate:'+alice);
 const reply=await call('POST','/?action=post',{body:'Here is an update',parentId:first.post.id},'Alice');assert.equal(reply.status,201);
 assert.equal((await call('GET','/?action=posts&parent='+first.post.id)).posts.length,1);
 assert.equal((await call('POST','/?action=delete-post',{id:first.post.id},'Bob')).status,403);
 assert.equal((await call('POST','/?action=delete-post',{id:first.post.id},'Alice')).status,200);
 assert.equal((await call('GET','/?action=posts')).posts.length,0);
});

test('likes and bookmarks are private to the signed-in viewer and can be undone',async()=>{
 const {call,values}=fixture();await call('POST','/',{name:'Alice',public:true},'Alice');
 const created=await call('POST','/?action=post',{body:'Building a better project page'},'Alice');const id=created.post.id;
 assert.equal((await call('POST','/?action=react',{id,kind:'like'},'Bob')).likes,1);
 assert.equal((await call('POST','/?action=react',{id,kind:'save'},'Bob')).active,true);
 const publicPost=(await call('GET','/?action=posts&post='+id)).posts[0];assert.equal(publicPost.likes,1);assert.equal(publicPost.liked,false);assert.equal(publicPost.saved,false);
 const bobPost=(await call('GET','/?action=posts&post='+id,null,'Bob')).posts[0];assert.equal(bobPost.liked,true);assert.equal(bobPost.saved,true);
 assert.equal((await call('GET','/?action=posts&saved=1',null,'Bob')).posts.length,1);
 assert.equal((await call('POST','/?action=react',{id,kind:'save'},'Bob')).active,false);
 assert.equal((await call('GET','/?action=posts&saved=1',null,'Bob')).posts.length,0);
 values.set('digivated:creator:profile:'+alice,JSON.stringify({name:'Alice',public:false}));
 assert.equal((await call('POST','/?action=react',{id,kind:'like'},'Bob')).status,404);
});

test('post media uses signed upload ticket and verifies file before publishing',async()=>{
 const env={COMMUNITY_SUPABASE_URL:'https://example.supabase.co',COMMUNITY_SUPABASE_SECRET_KEY:'test-secret'};let uploaded=false;
 const storageClient={storage:{from:bucket=>{assert.equal(bucket,'creator-media');return{createSignedUploadUrl:async()=>({data:{token:'signed-token'},error:null}),info:async()=>({data:uploaded?{size:1000,contentType:'image/png'}:null,error:uploaded?null:new Error('missing')})};}}};
 const {call}=fixture({env,storageClient});await call('POST','/',{name:'Alice',public:true},'Alice');
 assert.equal((await call('POST','/?action=media-ticket',{type:'video/mp4',size:20971521},'Alice')).status,400);
 const ticket=await call('POST','/?action=media-ticket',{type:'image/png',size:1000},'Alice');assert.equal(ticket.status,200);assert.equal(ticket.token,'signed-token');
 assert.equal((await call('POST','/?action=post',{body:'My latest work',mediaPath:ticket.path},'Alice')).status,400);
 uploaded=true;const created=await call('POST','/?action=post',{body:'My latest work',mediaPath:ticket.path},'Alice');assert.equal(created.status,201);assert.match(created.post.media.url,/creator-media/);
 assert.equal((await call('POST','/?action=post',{body:'Another work',mediaPath:ticket.path},'Bob')).status,403);
});
