import test from 'node:test';import assert from 'node:assert/strict';
import {MultiNotionStore} from '../multi-notion-store.mjs';
test('collection routing preserves legacy drafts and rejects foreign pages',async()=>{
 const drafts=new Map(),calls=[];
 const make=(id,kind)=>({id,kind,catalogId:id+'-catalog',capabilities:{write:true},journal:{get:k=>drafts.get(k)},request:async path=>({parent:{data_source_id:path.includes('foreign')?'foreign':'wine-catalog'}}),listInventory:async()=>[{id,product:{kind}}],prepare:async(k,c)=>calls.push([id,k,c]),commit:k=>id,getOperation:k=>id});
 const s=new MultiNotionStore([make('sake','sake'),make('wine','wine')]);
 assert.deepEqual(await s.listInventory({kind:'wine'}),[{id:'wine',product:{kind:'wine'}}]);
 await s.prepare('wine-new',{action:'add',product:{kind:'wine'}});assert.equal(calls.at(-1)[0],'wine');
 await s.prepare('wine-existing',{action:'add',productId:'known'});assert.equal(calls.at(-1)[0],'wine');
 await assert.rejects(s.prepare('bad',{action:'add',productId:'foreign'}),/not in/);
 drafts.set('legacy',{plan:'{}'});assert.equal(s.commit('legacy',true),'sake');
 drafts.set('wine-draft',{plan:'{"collectionId":"wine"}'});assert.equal(s.commit('wine-draft',true),'wine');
 drafts.set('removed',{plan:'{"collectionId":"missing"}'});assert.throws(()=>s.commit('removed',true),/not configured/);
});
