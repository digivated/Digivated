import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCreatorProfileHandler} from '../server/creator-profile.mjs';

const alice='123e4567-e89b-42d3-a456-426614174000',bob='123e4567-e89b-42d3-a456-426614174001';
function fixture(){
 const values=new Map(),sets=new Map();
 const redis=async([command,...args])=>{
  if(command==='GET')return values.get(args[0])??null;
  if(command==='SET'){values.set(args[0],args[1]);return 'OK';}
  if(command==='INCR'){const n=Number(values.get(args[0])||0)+1;values.set(args[0],n);return n;}
  if(command==='ZADD'){const items=sets.get(args[0])||[];items.unshift(args[2]);sets.set(args[0],items);return 1;}
  if(command==='ZREM')return 1;
  if(command==='ZREVRANGE')return(sets.get(args[0])||[]).slice(Number(args[1]),Number(args[2])+1);
  if(command==='MGET')return args.map(key=>values.get(key)||null);
  if(command==='SCARD')return 0;
  if(command==='SMEMBERS')return [];
  if(command==='EVAL'){const [,count,wait,daily,duplicate]=args;assert.equal(count,3);if(values.has(wait))return 1;const n=Number(values.get(daily)||0)+1;values.set(daily,n);if(n>30)return 2;if(values.has(duplicate))return 3;values.set(wait,'1');values.set(duplicate,'1');return 0;}
  throw Error(command);
 };
 const handler=makeCreatorProfileHandler({redis,env:{},verifyAccount:async req=>req.headers.authorization?{id:req.headers.authorization==='Alice'?alice:bob}:null});
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
