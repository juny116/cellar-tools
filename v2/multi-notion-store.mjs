// Keep each drink collection in its original Notion database.
export class MultiNotionStore {
 constructor(stores){
  if(!stores.length||new Set(stores.map(s=>s.id)).size!==stores.length||new Set(stores.map(s=>s.kind)).size!==stores.length)throw new Error('Configure one unique collection per kind');
  this.stores=stores;this.capabilities={backend:'notion',read:true,write:stores.every(s=>s.capabilities.write),atomicCommit:false,kinds:stores.map(s=>s.kind)};
 }
 async listInventory(options={}){return (await Promise.all(this.stores.filter(s=>!options.kind||s.kind===options.kind).map(s=>s.listInventory(options)))).flat();}
 async searchCatalog(query){return (await Promise.all(this.stores.map(s=>s.searchCatalog(query)))).flat();}
 getPreferences(){return this.stores[0].getPreferences();}
 operationStore(id){const row=this.stores[0].journal?.get(id);if(!row)throw new Error('Unknown draft');const collectionId=JSON.parse(row.plan).collectionId;const store=collectionId?this.stores.find(s=>s.id===collectionId):this.stores[0];if(!store)throw new Error('Draft collection is not configured');return store;}
 async pageStore(id,catalog=false){
  const page=await this.stores[0].request('/pages/'+encodeURIComponent(id));
  const store=this.stores.find(s=>(catalog?s.catalogId:s.id)===page.parent?.data_source_id);
  if(!store||page.archived||page.in_trash)throw new Error('Page is not in a configured collection');return store;
 }
 async prepare(id,change){
  if(this.stores[0].journal?.get(id))return this.operationStore(id).prepare(id,change);
  let store;
  if(change.action==='preferences')store=this.stores[0];
  else if(change.action==='add')store=change.productId?await this.pageStore(change.productId,true):this.stores.find(s=>s.kind===change.product?.kind);
  else store=await this.pageStore(change.bottleId);
  if(!store)throw new Error('No collection configured for this drink type');return store.prepare(id,change);
 }
 getOperation(id){return this.operationStore(id).getOperation(id);}
 commit(id,confirmed){return this.operationStore(id).commit(id,confirmed);}
 reconcile(id){return this.operationStore(id).reconcile(id);}
 async attachPhoto(id,...args){return (await this.pageStore(id)).attachPhoto(id,...args);}
 close(){for(const s of this.stores)s.close();}
}
