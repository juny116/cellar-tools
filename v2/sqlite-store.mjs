import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {changeSchema,requestIdSchema} from './schema.mjs';
function canonical(x){return JSON.stringify(x,(_,v)=>v && typeof v==='object' && !Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);}
export class SqliteStore {
  constructor(path){
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bottles(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),status TEXT NOT NULL CHECK(status IN ('available','consumed')),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,payload TEXT NOT NULL,expires INTEGER NOT NULL,result TEXT);
      CREATE TABLE IF NOT EXISTS preferences(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);`);
    this.capabilities={backend:'sqlite',read:true,write:true,atomicCommit:true};
  }
  close(){this.db.close();}
  listInventory({includeConsumed=false}={}){
    const rows=this.db.prepare(`SELECT b.*,p.data AS product FROM bottles b JOIN products p ON b.product_id=p.id ${includeConsumed?'':"WHERE status='available'"} ORDER BY b.rowid`).all();
    return rows.map(r=>({id:r.id,productId:r.product_id,status:r.status,...JSON.parse(r.data),product:JSON.parse(r.product)}));
  }
  getPreferences(){const r=this.db.prepare('SELECT data FROM preferences WHERE id=1').get();return r?JSON.parse(r.data):{likes:[],dislikes:[],notes:''};}
  prepare(requestId,input){
    requestIdSchema.parse(requestId);const payload=changeSchema.parse(input);
    const fingerprint=createHash('sha256').update(canonical(payload)).digest('hex');
    const old=this.db.prepare('SELECT * FROM drafts WHERE id=?').get(requestId);
    if(old){if(old.fingerprint!==fingerprint)throw new Error('Request ID reused with different content');return this.preview(old);}
    if(payload.action==='add' && payload.productId && !this.db.prepare('SELECT id FROM products WHERE id=?').get(payload.productId))throw new Error('Unknown productId');
    if(payload.action==='consume' || payload.action==='edit'){
      const b=this.db.prepare('SELECT status FROM bottles WHERE id=?').get(payload.bottleId);
      if(!b)throw new Error('Unknown bottle');if(payload.action==='consume' && b.status!=='available')throw new Error('Bottle already consumed');
    }
    // Only draft data is saved here; inventory is unchanged until commit.
    const row={id:requestId,fingerprint,payload:JSON.stringify(payload),expires:Date.now()+3600000,result:null};
    this.db.prepare('INSERT INTO drafts VALUES (?,?,?,?,NULL)').run(row.id,row.fingerprint,row.payload,row.expires);
    return this.preview(row);
  }
  preview(row){
    const payload=JSON.parse(row.payload);
    const candidates=payload.action==='add' && payload.product ? this.db.prepare('SELECT * FROM products').all().filter(r=>{
      const p=JSON.parse(r.data);return p.kind===payload.product.kind && p.name.normalize('NFKC').toLowerCase()===payload.product.name.normalize('NFKC').toLowerCase();
    }).map(r=>({id:r.id,...JSON.parse(r.data)})):[];
    return {draftId:row.id,change:payload,expiresAt:new Date(row.expires).toISOString(),committed:!!row.result,result:row.result?JSON.parse(row.result):null,candidates,note:candidates.length?'Possible existing variants: inspect before commit. To reuse, prepare a NEW request with productId. This draft creates a separate product.':null};
  }
  commit(id,confirmed){
    if(confirmed!==true)throw new Error('Review the draft and obtain user authorization before commit');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const row=this.db.prepare('SELECT * FROM drafts WHERE id=?').get(id);
      if(!row)throw new Error('Unknown draft');
      if(row.result){this.db.exec('COMMIT');return JSON.parse(row.result);}
      if(row.expires<Date.now())throw new Error('Draft expired; prepare a new request');
      const p=JSON.parse(row.payload);let result;
      if(p.action==='add'){
        const productId=p.productId??randomUUID();
        if(p.product)this.db.prepare('INSERT INTO products VALUES (?,?)').run(productId,JSON.stringify(p.product));
        const bottleIds=[];for(let i=0;i<p.count;i++){
          const id=randomUUID();this.db.prepare("INSERT INTO bottles VALUES (?,?,'available',?)").run(id,productId,JSON.stringify(p.bottle));bottleIds.push(id);
        }result={action:'add',productId,bottleIds};
      }else if(p.action==='consume'){
        const old=this.db.prepare('SELECT * FROM bottles WHERE id=?').get(p.bottleId);
        if(!old || old.status!=='available')throw new Error('Bottle no longer available; refresh inventory');
        this.db.prepare("UPDATE bottles SET status='consumed',data=? WHERE id=?").run(JSON.stringify({...JSON.parse(old.data),consumedDate:p.date}),p.bottleId);
        result={action:'consume',bottleId:p.bottleId,date:p.date};
      }else if(p.action==='edit'){
        const old=this.db.prepare('SELECT data FROM bottles WHERE id=?').get(p.bottleId);
        if(!old)throw new Error('Unknown bottle');
        this.db.prepare('UPDATE bottles SET data=? WHERE id=?').run(JSON.stringify({...JSON.parse(old.data),...p.bottle}),p.bottleId);
        result={action:'edit',bottleId:p.bottleId};
      }else{
        this.db.prepare('INSERT INTO preferences VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(p.preferences));result={action:'preferences',preferences:p.preferences};
      }
      this.db.prepare('UPDATE drafts SET result=? WHERE id=?').run(JSON.stringify(result),id);
      this.db.exec('COMMIT');return result;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
}
