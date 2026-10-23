import test from 'node:test';
import assert from 'node:assert/strict';
import {NotionStore} from '../notion-store.mjs';
const cellar='1'.repeat(32),catalog='2'.repeat(32);
const add={action:'add',product:{kind:'sake',name:'Example',producer:'Brewery',sources:[{kind:'user',reference:'fixture'}]},bottle:{volumeMl:720,note:'keep'},count:2};
function fixture(){
 const calls=[],pages=new Map();let serial=0,failAt=0,posts=0;
 const s={title:{type:'title'},rich:{type:'rich_text'}};
 const schema={'#':s.title,Note:s.rich,'저장위치':s.rich,'Purchase date':{type:'date'},Price:{type:'number'},Sakes:{type:'relation',relation:{data_source_id:catalog}},Consumed:{type:'checkbox'},'Consume date':{type:'date'},'용량':{type:'select',select:{options:[{name:'720ml (四合 욘고)'}]}}};
 const cs={'Sake name':s.title,Brewery:s.rich,'BY(양조연도)':s.rich};
 const store=new NotionStore({token:'test',dataSourceId:cellar,catalogDataSourceId:catalog,journalPath:':memory:',fetchImpl:async(url,o)=>{
 calls.push({url,...o});const body=o.body?JSON.parse(o.body):null;let data;
 if(o.method==='POST'&&url.endsWith('/pages')){posts++;if(posts===failAt)throw new Error('simulated timeout');const id='page-'+(++serial);data={id,parent:body.parent,properties:Object.fromEntries(Object.entries(body.properties).map(([k,v])=>[k,{type:Object.keys(v)[0],...v}]))};pages.set(id,data);}
 else if(o.method==='PATCH'){const id=url.split('/').at(-1);data=pages.get(id);data.properties={...data.properties,...Object.fromEntries(Object.entries(body.properties).map(([k,v])=>[k,{type:Object.keys(v)[0],...v}]))};}
 else if(url.endsWith('/query'))data={results:[],has_more:false};
 else if(url.endsWith('/data_sources/'+cellar))data={properties:schema};
 else if(url.endsWith('/data_sources/'+catalog))data={properties:cs};
 else data=pages.get(url.split('/').at(-1));
 if(!data)throw new Error('missing fixture '+url);return {ok:true,json:async()=>structuredClone(data)};
 }});
 return {store,calls,pages,setFailure:n=>failAt=n,schema};
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
