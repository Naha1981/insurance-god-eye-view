import assert from 'node:assert/strict';
import {fetchWithDeadline} from '../src/evidence/request-deadline.js';
let calls=0;
const ok=await fetchWithDeadline('/fixture',{},100,async()=>{calls++;return {ok:true}});
assert.equal(ok.ok,true);assert.equal(calls,1);
await assert.rejects(fetchWithDeadline('/fixture',{},10,async(_,options)=>{calls++;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))))}),/No automatic retry/);
assert.equal(calls,2);
await assert.rejects(fetchWithDeadline('/fixture',{},100,async()=>{throw new Error('offline fixture')}),/offline fixture/);
console.log('PASS fast response, abort deadline, no retry, original network error');
