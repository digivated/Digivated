import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCreatorInboxHandler} from '../server/creator-inbox.mjs';
const alice='123e4567-e89b-42d3-a456-426614174000',bob='123e4567-e89b-42d3-a456-426614174001',stranger='123e4567-e89b-42d3-a456-426614174002';
function fixture(){const values=new Map([[`digivated:creator:profile:${alice}`,JSON.stringify({name:'Alice',public:true})],[`digivated:creator:profile:${bob}`,JSON.stringify({name:'Bob',public:true})]]),indexes=new Map(),sets=new Map();
 const redis=async([command,...args])=>{
  if(command==='GET')return values.get(args[0])??null;
  if(command==='SET'){values.set(args[0],args[1]);return'OK';}
  if(command==='DEL'){values.delete(args[0]);return 1;}
  if(command==='INCR'){const n=Number(values.get(args[0])||0)+1;values.set(args[0],n);return n;}
  if(command==='EVAL'){const key=args[2];const n=Number(values.get(key)||0)+1;values.set(key,n);return n;}
  if(command==='ZADD'){const entries=indexes.get(args[0])||[];entries.push(args[2]);indexes.set(args[0],entries);return 1;}
  if(command==='ZREVRANGE')return(indexes.get(args[0])||[]).slice().reverse().slice(Number(args[1]),Number(args[2])+1);
  if(command==='ZRANGE')return(indexes.get(args[0])||[]).slice(Number(args[1])<0?Math.max(0,(indexes.get(args[0])||[]).length+Number(args[1])):Number(args[1]));
  if(command==='MGET')return args.map(key=>values.get(key)||null);
  if(command==='SISMEMBER')return(sets.get(args[0])||new Set()).has(args[1])?1:0;
  if(command==='SADD'){const set=sets.get(args[0])||new Set();set.add(args[1]);sets.set(args[0],set);return 1;}
  if(command==='SREM'){sets.get(args[0])?.delete(args[1]);return 1;}
  throw Error(command);
 };
 const handler=makeCreatorInboxHandler({redis,env:{},verifyAccount:async req=>req.headers.authorization?{id:req.headers.authorization==='Alice'?alice:req.headers.authorization==='Bob'?bob:stranger}:null});
 const call=async(actor,method,url,body,origin='https://digivated.com')=>{let raw;const res={setHeader(){},end(value){raw=value;}};await handler({method,url,body,headers:{...(actor?{authorization:actor}:{}),origin,'content-type':'application/json'}},res);return{status:res.statusCode,...JSON.parse(raw)};};return{call,values};}
test('inbox keeps messages between participants and blocks links, strangers, and blocked senders',async()=>{const{call}=fixture();
 assert.equal((await call(null,'GET','/?action=list')).status,401);
 assert.equal((await call('Alice','POST','/?action=send',{to:bob,body:'Check https://spam.example'})).status,400);
 assert.equal((await call('Alice','POST','/?action=send',{to:bob,body:'Hey Bob, how is your project going?'},'https://evil.example')).status,403);
 assert.equal((await call('Alice','POST','/?action=send',{to:bob,body:'Hey Bob, how is your project going?'})).status,201);
 assert.equal((await call('Bob','GET','/?action=list')).conversations[0].unread,1);
 assert.equal((await call('Bob','GET','/?action=thread&id='+alice)).messages.length,1);
 assert.equal((await call('Bob','GET','/?action=list')).conversations[0].unread,0);
 assert.equal((await call('Stranger','GET','/?action=list')).conversations.length,0);
 assert.equal((await call('Bob','POST','/?action=block',{to:alice,operation:'block'})).blocked,true);
 assert.equal((await call('Alice','POST','/?action=send',{to:bob,body:'Another message'})).status,403);
});
