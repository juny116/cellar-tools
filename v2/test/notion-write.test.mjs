import test from 'node:test';
import assert from 'node:assert/strict';
import {NotionStore} from '../notion-store.mjs';
const cellar='1'.repeat(32),catalog='2'.repeat(32);
const add={action:'add',product:{kind:'sake',name:'Example',producer:'Brewery',sources:[{kind:'user',reference:'fixture'}]},bottle:{volumeMl:720,note:'keep'},count:2};
function fixture(){
 const calls=[],pages=new Map();let serial=0,failAt=0,posts=0,afterWrite=false;
 const s={title:{type:'title'},rich:{type:'rich_text'}};
 const schema={'#':s.title,Note:s.rich,'저장위치':s.rich,'Purchase date':{type:'date'},Price:{type:'number'},Sakes:{type:'relation',relation:{data_source_id:catalog}},Consumed:{type:'checkbox'},'Consume date':{type:'date'},'용량':{type:'select',select:{options:[{name:'720ml (四合 욘고)'}]}}};
 const cs={'Sake name':s.title,Brewery:s.rich,'BY(양조연도)':s.rich};
 const store=new NotionStore({token:'test',dataSourceId:cellar,catalogDataSourceId:catalog,journalPath:':memory:',fetchImpl:async(url,o)=>{
 calls.push({url,...o});const body=o.body?JSON.parse(o.body):null;let data;
 if(o.method==='POST'&&url.endsWith('/pages')){posts++;if(posts===failAt&&!afterWrite)throw new Error('simulated timeout');const id='page-'+(++serial);data={id,parent:body.parent,properties:Object.fromEntries(Object.entries(body.properties).map(([k,v])=>[k,{type:Object.keys(v)[0],...v}]))};data.children=body.children??[];pages.set(id,data);if(posts===failAt&&afterWrite)throw new Error('simulated timeout after success');}
 else if(o.method==='PATCH'){const id=url.split('/').at(-1);data=pages.get(id);data.properties={...data.properties,...Object.fromEntries(Object.entries(body.properties).map(([k,v])=>[k,{type:Object.keys(v)[0],...v}]))};}
 else if(url.includes('/blocks/'))data={results:pages.get(url.split('/blocks/')[1].split('/')[0]).children,has_more:false};
 else if(url.endsWith('/query')){const source=url.split('/data_sources/')[1].split('/')[0];data={results:[...pages.values()].filter(page=>page.parent.data_source_id===source),has_more:false};}
 else if(url.endsWith('/data_sources/'+cellar))data={properties:schema};
 else if(url.endsWith('/data_sources/'+catalog))data={properties:cs};
 else data=pages.get(url.split('/').at(-1));
 if(!data)throw new Error('missing fixture '+url);return {ok:true,json:async()=>structuredClone(data)};
 }});
 return {store,calls,pages,setFailure:(n,after=false)=>{failAt=n;afterWrite=after;},schema};
}
test('Notion preview is read-only; commit preserves product/bottle separation and replays',async()=>{
 const f=fixture();try{await f.store.prepare('purchase-001',add);assert.equal(f.pages.size,0);const r=await f.store.commit('purchase-001',true);assert.equal(f.pages.size,3);assert.equal(r.bottleIds.length,2);assert.deepEqual(await f.store.commit('purchase-001',true),r);assert.equal(f.pages.size,3);assert.equal(f.pages.get(r.bottleIds[0]).properties.Sakes.relation[0].id,r.productId);}finally{f.store.close();}
});
test('edit touches only supplied fields; concurrent edits invalidate preview',async()=>{
 const f=fixture();try{await f.store.prepare('purchase-001',add);const r=await f.store.commit('purchase-001',true),id=r.bottleIds[0];
 f.pages.get(id).properties.Bottle={type:'files',files:[{type:'external',external:{url:'https://example.com/photo'}}]};
 await f.store.prepare('edit-note-001',{action:'edit',bottleId:id,bottle:{note:'new note'}});await f.store.commit('edit-note-001',true);
 assert.match(f.pages.get(id).properties.Note.rich_text[0].text.content,/cellar-op:purchase-001:1/);assert.equal(f.pages.get(id).properties.Bottle.files.length,1);
 await f.store.prepare('consume-001',{action:'consume',bottleId:id,date:'2026-10-23'});f.pages.get(id).properties.Consumed.checkbox=true;
 await assert.rejects(f.store.commit('consume-001',true),/changed in Notion/);
 }finally{f.store.close();}
});
test('unknown write outcome blocks blind retry and duplicate creation',async()=>{
 const f=fixture();try{await f.store.prepare('purchase-001',add);f.setFailure(3);await assert.rejects(f.store.commit('purchase-001',true),/timeout/);assert.equal(f.pages.size,2);
 await assert.rejects(f.store.commit('purchase-001',true),/reconciliation/);assert.equal(f.pages.size,2);
 }finally{f.store.close();}
});
test('schema mismatch, foreign pages and wrong drink collections fail before mutation',async()=>{
 const f=fixture();try{await assert.rejects(f.store.prepare('wrong-kind-001',{...add,product:{...add.product,kind:'wine'}}),/configured for sake/);
 f.pages.set('foreign',{id:'foreign',parent:{data_source_id:catalog},properties:{}});await assert.rejects(f.store.prepare('foreign-001',{action:'consume',bottleId:'foreign',date:'2026-10-23'}),/configured data source/);
 await assert.rejects(f.store.prepare('volume-001',{...add,bottle:{volumeMl:500}}),/volume option/);assert.ok(!f.calls.some(c=>c.method==='PATCH'||c.url.endsWith('/pages')));
 }finally{f.store.close();}
});

test('reconcile recovers an acknowledged-lost bottle without duplicating it and finishes remaining bottles',async()=>{
 const f=fixture();try{
 await f.store.prepare('recovery-001',{...add,count:3});f.setFailure(3,true);
 await assert.rejects(f.store.commit('recovery-001',true),/after success/);assert.equal(f.pages.size,3);
 const report=await f.store.reconcile('recovery-001');assert.equal(report.status,'ready');
 const result=await f.store.commit('recovery-001',true);assert.equal(result.bottleIds.length,3);assert.equal(f.pages.size,4);
 assert.deepEqual(await f.store.commit('recovery-001',true),result);
 }finally{f.store.close();}
});
test('reconcile recovers product via exact block marker; missing or ambiguous evidence stays blocked',async()=>{
 const f=fixture();try{
 await f.store.prepare('product-recover-001',add);f.setFailure(1,true);
 await assert.rejects(f.store.commit('product-recover-001',true),/after success/);
 assert.equal((await f.store.reconcile('product-recover-001')).status,'ready');
 await f.store.commit('product-recover-001',true);assert.equal(f.pages.size,3);
 await f.store.prepare('missing-recover-001',add);f.setFailure(4);
 await assert.rejects(f.store.commit('missing-recover-001',true),/timeout/);
 assert.equal((await f.store.reconcile('missing-recover-001')).status,'needs_review');
 await assert.rejects(f.store.commit('missing-recover-001',true),/reconciliation/);
 }finally{f.store.close();}
});
test('reconcile verifies a lost patch response and refuses to reclaim a running operation',async()=>{
 const f=fixture();try{
 await f.store.prepare('patch-setup-001',add);const {bottleIds}=await f.store.commit('patch-setup-001',true);
 await f.store.prepare('patch-recover-001',{action:'consume',bottleId:bottleIds[0],date:'2026-10-23'});
 const original=f.store.request.bind(f.store);let lost=false;
 f.store.request=async(...args)=>{const value=await original(...args);if(args[2]==='PATCH'&&!lost){lost=true;throw new Error('lost patch response');}return value;};
 await assert.rejects(f.store.commit('patch-recover-001',true),/lost patch/);
 assert.equal((await f.store.reconcile('patch-recover-001')).status,'ready');
 assert.equal((await f.store.commit('patch-recover-001',true)).action,'consume');
 assert.equal(f.calls.filter(c=>c.method==='PATCH').length,1);
 await f.store.prepare('active-operation-001',add);f.store.journal.claim('active-operation-001');
 await assert.rejects(f.store.reconcile('active-operation-001'),/still be running/);
 }finally{f.store.close();}
});
