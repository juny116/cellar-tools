import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {uploadImage} from '../src/notion-images.mjs';
import {Journal} from './notion-journal.mjs';
import {changeSchema,requestIdSchema} from './schema.mjs';
const text=x=>(x?.title??x?.rich_text??[]).map(t=>t.plain_text??t.text?.content??'').join('');
const runs=s=>s?String(s).match(/[\s\S]{1,2000}/g).map(content=>({type:'text',text:{content}})):[];
const rich=s=>({rich_text:runs(s)});
const canonical=x=>JSON.stringify(x,(_,v)=>v && typeof v==='object' && !Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export class NotionStore {
 constructor({token,dataSourceId,catalogDataSourceId,kind='sake',properties={},journalPath,fetchImpl=fetch}){
  if(!token || !/^[a-f0-9-]{32,36}$/i.test(dataSourceId??''))throw new Error('Notion token and cellar data source ID required');
  this.token=token;this.id=dataSourceId;this.catalogId=catalogDataSourceId;this.kind=kind;this.fetch=fetchImpl;
  this.props={title:'#',relation:'Sakes',consumed:'Consumed',consumeDate:'Consume date',purchaseDate:'Purchase date',price:'Price',note:'Note',volume:'용량',location:'저장위치',photos:'Bottle',productTitle:'Sake name',producer:'Brewery',vintage:'BY(양조연도)',...properties};
  this.journal=journalPath?new Journal(journalPath):null;
  this.capabilities={backend:'notion',read:true,write:!!this.journal && !!this.catalogId,atomicCommit:false,kind};
 }
 async request(path,body,method){
  const r=await this.fetch(`https://api.notion.com/v1${path}`,{method:method??(body?'POST':'GET'),headers:{Authorization:`Bearer ${this.token}`,'Notion-Version':'2026-03-11','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error(`Notion request failed (${r.status})`);return r.json();
 }
 async rows(id,filter){const out=[];let cursor;do{const d=await this.request(`/data_sources/${id}/query`,{page_size:100,...(filter?{filter}:{}),...(cursor?{start_cursor:cursor}:{})});out.push(...d.results);cursor=d.has_more?d.next_cursor:null;if(d.has_more&&!cursor)throw new Error('Notion pagination missing cursor');}while(cursor);return out;}
 images(page){return (page.properties?.[this.props.photos]?.files??[]).map(f=>f.file?.url??f.external?.url).filter(Boolean);}
 async listInventory({includeConsumed=false}={}){
  const out=[],products=new Map(),p=this.props;
  for(const row of await this.rows(this.id)){
   const props=row.properties;
   if(props[p.consumed]?.type!=='checkbox'||props[p.relation]?.type!=='relation')throw new Error('Notion schema mismatch: configure consumed checkbox and catalog relation');
   const status=props[p.consumed].checkbox?'consumed':'available';if(!includeConsumed&&status==='consumed')continue;
   const ids=props[p.relation].relation.map(x=>x.id);let product=null,images=this.images(row);
   if(ids.length===1&&!props[p.relation].has_more){
    if(!products.has(ids[0]))products.set(ids[0],await this.request(`/pages/${ids[0]}`));
    const page=products.get(ids[0]);product={kind:this.kind,name:text(page.properties[p.productTitle]),producer:text(page.properties[p.producer]),vintage:text(page.properties[p.vintage]),sourceUrl:page.url,details:Object.fromEntries(Object.entries(page.properties).filter(([,v])=>['number','select','multi_select','rich_text','url'].includes(v.type)).map(([k,v])=>[k,v.type==='select'?v.select?.name:v.type==='multi_select'?v.multi_select.map(x=>x.name).join(', '):v.type==='rich_text'?text(v):v[v.type]]))};
    images=[...images,...this.images(page)];
   }
   const label=props[p.volume]?.select?.name??null;
   out.push({id:row.id,status,title:text(props[p.title]),productId:ids.length===1?ids[0]:null,productIds:ids,product,images:[...new Set(images)],relationIncomplete:!!props[p.relation].has_more,volumeLabel:label,volumeMl:label?Number(label.match(/^(\d+)/)?.[1])||null:null,price:props[p.price]?.number??null,currency:'KRW',purchaseDate:props[p.purchaseDate]?.date?.start??null,consumedDate:props[p.consumeDate]?.date?.start??null,location:text(props[p.location]),note:text(props[p.note]),sourceUrl:row.url});
  }return out;
 }
 async attachPhoto(id,filename,base64){
  if(!this.capabilities.write)throw new Error('Notion writes not configured');
  if(typeof filename!=='string'||!/[.](png|jpe?g|webp|gif)$/i.test(filename))throw new Error('Use PNG, JPEG, WebP or GIF');
  if(typeof base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error('Invalid image data');
  const bytes=Buffer.from(base64,'base64');if(!bytes.length||bytes.length>10*1024*1024)throw new Error('Image must be between 1 byte and 10 MB');
  await this.scopedPage(id,this.id);
  const dir=await mkdtemp(join(tmpdir(),'cellar-photo-'));
  try{const file=join(dir,basename(filename));await writeFile(file,bytes,{mode:0o600});return await uploadImage(file,id,this.props.photos,{token:this.token,fetchImpl:this.fetch});}
  finally{await rm(dir,{recursive:true,force:true});}
 }
 getPreferences(){const row=this.journal?.db.prepare('SELECT data FROM notion_preferences WHERE id=1').get();return row?JSON.parse(row.data):{likes:[],dislikes:[],notes:''};}
 async scopedPage(id,source){const page=await this.request(`/pages/${id}`);if(page.archived||page.in_trash||page.parent?.data_source_id!==source)throw new Error('Page is not an active member of the configured data source');return page;}
 async schemas(){const [b,c]=await Promise.all([this.request(`/data_sources/${this.id}`),this.request(`/data_sources/${this.catalogId}`)]);return {b:b.properties,c:c.properties};}
 require(schema,key,type){if(schema[key]?.type!==type)throw new Error(`Notion schema mismatch: ${key} must be ${type}`);}
 bottleProperties(b,schema,{create=false}={}){
  const p=this.props,out={};
  const set=(key,type,value)=>{this.require(schema,key,type);out[key]={[type]:value};};
  if('location'in b)set(p.location,'rich_text',rich(b.location).rich_text);
  if('note'in b)set(p.note,'rich_text',rich(b.note).rich_text);
  if('price'in b){if(b.currency && b.currency!=='KRW')throw new Error('This Notion price field uses KRW');set(p.price,'number',b.price);}
  if('purchaseDate'in b)set(p.purchaseDate,'date',b.purchaseDate?{start:b.purchaseDate}:null);
  if('volumeMl'in b){this.require(schema,p.volume,'select');const value=b.volumeMl;const option=schema[p.volume].select.options.find(o=>Number(o.name.match(/^(\d+)\s*ml/i)?.[1])===value);if(value!==null&&!option)throw new Error(`No existing volume option for ${value} ml; add the option in Notion first`);set(p.volume,'select',option?{name:option.name}:null);}
  return out;
 }
 preview(row){return {draftId:row.id,change:JSON.parse(row.payload),...JSON.parse(row.plan).summary,expiresAt:new Date(row.expires).toISOString(),committed:row.status==='done',status:row.status,result:row.result?JSON.parse(row.result):null};}
 async prepare(id,input){
  if(!this.capabilities.write)throw new Error('Notion writes require catalogDataSourceId and a persistent journal');
  requestIdSchema.parse(id);const change=changeSchema.parse(input),old=this.journal.get(id);
  if(old){if(canonical(JSON.parse(old.payload))!==canonical(change))throw new Error('Request ID reused with different content');return this.preview(old);}
  const plan={summary:{candidates:[],note:null}};const p=this.props;
  if(change.action==='preferences'){plan.preferences=change.preferences;}
  else {
   const schema=await this.schemas();
   if(change.action==='add'){
    this.require(schema.b,p.title,'title');this.require(schema.b,p.relation,'relation');this.require(schema.b,p.consumed,'checkbox');this.require(schema.b,p.note,'rich_text');
    if(schema.b[p.relation].relation?.data_source_id!==this.catalogId)throw new Error('Catalog relation targets a different data source');
    plan.bottle=this.bottleProperties(change.bottle,schema.b);
    if(change.productId){const product=await this.scopedPage(change.productId,this.catalogId);plan.productId=product.id;plan.name=text(product.properties[p.productTitle]);}
    else {
     if(change.product.kind!==this.kind)throw new Error(`This collection is configured for ${this.kind}; connect the appropriate Notion collection for another drink type`);
     this.require(schema.c,p.productTitle,'title');this.require(schema.c,p.producer,'rich_text');
     const product=change.product;plan.name=product.name;
     plan.product={parent:{type:'data_source_id',data_source_id:this.catalogId},properties:{[p.productTitle]:{title:[{text:{content:[product.name,product.variant].filter(Boolean).join(' · ')}}]},[p.producer]:rich(product.producer)},children:[{object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:`cellar-op:${id}\n${product.sources.map(x=>`${x.kind}: ${x.reference}${x.note?' — '+x.note:''}`).join('\n')}`.slice(0,2000)}}]}}]};
     if(product.vintage){this.require(schema.c,p.vintage,'rich_text');plan.product.properties[p.vintage]=rich(product.vintage);}
     const candidates=await this.rows(this.catalogId,{property:p.productTitle,title:{contains:product.name}});plan.summary.candidates=candidates.map(x=>({id:x.id,name:text(x.properties[p.productTitle]),producer:text(x.properties[p.producer]),vintage:text(x.properties[p.vintage])}));
     if(candidates.length)plan.summary.note='비슷한 제품이 있습니다. 기존 제품이라면 해당 제품을 선택해 다시 작성하세요. 적용하면 별도 제품을 만듭니다.';
    }
   }else{
    const page=await this.scopedPage(change.bottleId,this.id);
    plan.bottleId=change.bottleId;plan.summary.bottleName=text(page.properties[p.title]);
    if(change.action==='consume'){
     this.require(schema.b,p.consumed,'checkbox');this.require(schema.b,p.consumeDate,'date');
     if(page.properties[p.consumed].checkbox)throw new Error('Bottle already consumed');
     plan.patch={[p.consumed]:{checkbox:true},[p.consumeDate]:{date:{start:change.date}}};
    }else {plan.patch=this.bottleProperties(change.bottle,schema.b);if('note'in change.bottle){const markers=text(page.properties[p.note]).match(/cellar-op:[^\s]+/g)??[];plan.patch[p.note]=rich([...new Set([...markers,change.bottle.note??''])].filter(Boolean).join('\n'));}}
    plan.before=Object.fromEntries(Object.keys(plan.patch).map(k=>[k,page.properties[k]]));
   }
  }
  const row=this.journal.save(id,change,plan);if(canonical(JSON.parse(row.payload))!==canonical(change))throw new Error('Request ID conflict');return this.preview(row);
 }
 async commit(id,confirmed){
  if(!this.capabilities.write)throw new Error('Notion writes not configured');if(confirmed!==true)throw new Error('Review and confirm the draft');
  const row=this.journal.get(id);if(!row)throw new Error('Unknown draft');if(row.result)return JSON.parse(row.result);if(row.expires<Date.now())throw new Error('Draft expired');
  if(!this.journal.claim(id))throw new Error('This operation is running or needs reconciliation. Do not create a duplicate request.');
  const change=JSON.parse(row.payload),plan=JSON.parse(row.plan),p=this.props;let result;
  try{
   if(change.action==='preferences'){
    this.journal.db.prepare('INSERT INTO notion_preferences VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(plan.preferences));result={action:'preferences',preferences:plan.preferences};
   }else if(change.action==='add'){
    let productId=plan.productId;
    if(productId)await this.scopedPage(productId,this.catalogId);
    else productId=(await this.journal.step(id+':product',()=>this.request('/pages',plan.product))).id;
    const bottleIds=[];
    for(let i=0;i<change.count;i++){
     const properties={...plan.bottle,[p.title]:{title:[{text:{content:plan.name}}]},[p.relation]:{relation:[{id:productId}]},[p.consumed]:{checkbox:false},[p.note]:rich([change.bottle.note,`cellar-op:${id}:${i+1}`].filter(Boolean).join('\n'))};
     const created=await this.journal.step(id+':bottle:'+i,()=>this.request('/pages',{parent:{type:'data_source_id',data_source_id:this.id},properties}));bottleIds.push(created.id);
    }result={action:'add',productId,bottleIds};
   }else{
    const page=await this.scopedPage(plan.bottleId,this.id);
    for(const k of Object.keys(plan.before))if(canonical(page.properties[k])!==canonical(plan.before[k]))throw new Error('Bottle changed in Notion since preview. Refresh and prepare a new draft.');
    await this.journal.step(id+':patch',()=>this.request(`/pages/${plan.bottleId}`,{properties:plan.patch},'PATCH'));
    result={action:change.action,bottleId:plan.bottleId};
   }
   this.journal.finish(id,result);return result;
  }catch(e){this.journal.db.prepare("UPDATE notion_drafts SET status='needs_review' WHERE id=?").run(id);throw e;}
 }
 close(){this.journal?.close();}
}
