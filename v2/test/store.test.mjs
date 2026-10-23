import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteStore} from '../sqlite-store.mjs';
import {NotionStore} from '../notion-store.mjs';
const add={action:'add',product:{kind:'wine',name:'Test wine',producer:'Test producer',vintage:'2020',sources:[{kind:'label',reference:'test.jpg'}]},bottle:{volumeMl:750},count:2};
test('draft is inert; commit and replay survive reopening without duplicate bottles',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cellar-db-'));const path=join(dir,'test.sqlite');let s=new SqliteStore(path);
 try{
 const preview=s.prepare('purchase-001',add);assert.equal(s.listInventory().length,0);
 assert.throws(()=>s.commit(preview.draftId,false),/authorization/);
 const result=s.commit(preview.draftId,true);assert.equal(result.bottleIds.length,2);
 s.close();s=new SqliteStore(path);assert.deepEqual(s.commit(preview.draftId,true),result);assert.equal(s.listInventory().length,2);
 assert.throws(()=>s.prepare('purchase-001',{...add,count:3}),/different content/);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('variants are candidates, not silently merged; product reuse is explicit',()=>{
 const s=new SqliteStore(':memory:');try{
 s.prepare('purchase-001',add);const first=s.commit('purchase-001',true);
 const draft=s.prepare('purchase-002',{...add,product:{...add.product,vintage:'2021'}});assert.equal(draft.candidates.length,1);
 const second=s.commit('purchase-002',true);assert.notEqual(first.productId,second.productId);
 s.prepare('purchase-003',{action:'add',productId:first.productId,bottle:{volumeMl:375},count:1});s.commit('purchase-003',true);
 assert.equal(s.listInventory().filter(b=>b.productId===first.productId).length,3);
 }finally{s.close();}
});
test('two consumption drafts cannot consume the same physical bottle twice',()=>{
 const s=new SqliteStore(':memory:');try{
 s.prepare('purchase-001',add);const {bottleIds}=s.commit('purchase-001',true);
 const change={action:'consume',bottleId:bottleIds[0],date:'2026-10-23'};
 s.prepare('consume-001',change);s.prepare('consume-002',change);s.commit('consume-001',true);
 assert.throws(()=>s.commit('consume-002',true),/no longer available/);
 assert.equal(s.listInventory().length,1);assert.equal(s.listInventory({includeConsumed:true}).length,2);
 assert.equal(s.commit('consume-001',true).bottleId,bottleIds[0]);
 }finally{s.close();}
});
test('invalid facts, dates, expired drafts and preference updates',()=>{
 const s=new SqliteStore(':memory:');try{
 assert.throws(()=>s.prepare('bad-op-001',{...add,count:-1}));
 assert.throws(()=>s.prepare('bad-op-002',{...add,product:{...add.product,sources:[]}}));
 assert.throws(()=>s.prepare('bad-op-003',{...add,bottle:{purchaseDate:'2026-02-30'}}));
 s.prepare('purchase-001',add);s.db.prepare('UPDATE drafts SET expires=0 WHERE id=?').run('purchase-001');
 assert.throws(()=>s.commit('purchase-001',true),/expired/);assert.equal(s.listInventory().length,0);
 const preferences={likes:['dry'],dislikes:[],notes:'Explicit test preference'};
 s.prepare('preference-001',{action:'preferences',preferences});assert.deepEqual(s.getPreferences().likes,[]);
 s.commit('preference-001',true);assert.deepEqual(s.getPreferences(),preferences);
 }finally{s.close();}
});
test('Notion adapter follows pagination, joins product, excludes consumed and never writes',async()=>{
 const calls=[];let n=0;
 const props=(consumed)=>({'#':{title:[{plain_text:'Bottle'}]},Consumed:{type:'checkbox',checkbox:consumed},Sakes:{type:'relation',relation:[{id:'p1'}]}});
 const store=new NotionStore({token:'test',dataSourceId:'0'.repeat(32),fetchImpl:async(url,o)=>{
 calls.push({url,...o});return {ok:true,json:async()=>url.includes('/pages/')?{url:'https://notion.so/p1',properties:{'Sake name':{title:[{plain_text:'Sake'}]},Brewery:{rich_text:[{plain_text:'Brewery'}]}}}:++n===1?{results:[{id:'b1',properties:props(false)}],has_more:true,next_cursor:'next'}:{results:[{id:'b2',properties:props(true)}],has_more:false}};
 }});
 const inv=await store.listInventory();assert.equal(inv.length,1);assert.equal(inv[0].product.name,'Sake');
 assert.equal(JSON.parse(calls.at(-1).body).start_cursor,'next');assert.throws(()=>store.prepare(),/not implemented/);
 assert.ok(calls.every(c=>c.method==='GET'||c.url.endsWith('/query')));
});
