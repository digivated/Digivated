import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{operatorAccess}from'../server/x-operator.mjs';
const token='a'.repeat(64),now=Date.now(),env={X_OPERATOR_TOKEN_HASH:createHash('sha256').update(token).digest('hex'),X_OPERATOR_EXPIRES_AT:String(now+60000)};
test('temporary maintenance fails closed and write grants are single-use',async()=>{const used=new Set();const redis=async c=>{if(used.has(c[1]))return null;used.add(c[1]);return'OK';};const req={headers:{'x-digivated-operator':token}};
 assert.equal(await operatorAccess({headers:{}},env,redis,'publish',now),false);assert.equal(await operatorAccess(req,{...env,X_OPERATOR_EXPIRES_AT:String(now-1)},redis,'publish',now),false);assert.equal(await operatorAccess(req,env,redis,'arbitrary',now),false);
 assert.equal(await operatorAccess(req,env,redis,'publish',now),true);assert.equal(await operatorAccess(req,env,redis,'publish',now),false);assert.equal(await operatorAccess(req,env,redis,'diagnostics',now),true);
});
