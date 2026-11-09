import {createHash,timingSafeEqual} from 'node:crypto';
// Temporary owner-authorized maintenance capability. No credentials are returned.
// Only fixed operations are exposed; write operations are one-use and still run
// through the normal workers, including duplicate/rate/uncertain-send guards.
export async function operatorAccess(req,env,redis,action,now=Date.now()){
 const supplied=req.headers['x-digivated-operator'],expected=env.X_OPERATOR_TOKEN_HASH;
 const expiry=Number(env.X_OPERATOR_EXPIRES_AT);
 if(typeof supplied!=='string'||supplied.length!==64||!/[a-f0-9]{64}/.test(supplied)||! /^[a-f0-9]{64}$/.test(expected||'')||!Number.isFinite(expiry)||expiry<=now||expiry>now+2*3600000)return false;
 const actual=createHash('sha256').update(supplied).digest('hex');
 if(!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return false;
 if(!['diagnostics','research','publish','resume'].includes(action))return false;
 if(action==='diagnostics')return true;
 return await redis(['SET',`digivated:private:x-operator:${expected}:${action}`,'used','NX','EX',7200])==='OK';
}
