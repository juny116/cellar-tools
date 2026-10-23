import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export class Journal {
 constructor(path){if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);this.db.exec(`PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS notion_drafts(id TEXT PRIMARY KEY,payload TEXT NOT NULL,plan TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'ready',result TEXT);
 CREATE TABLE IF NOT EXISTS notion_steps(id TEXT PRIMARY KEY,result TEXT);
 CREATE TABLE IF NOT EXISTS notion_preferences(id INTEGER PRIMARY KEY,data TEXT NOT NULL);`);}
 get(id){return this.db.prepare('SELECT * FROM notion_drafts WHERE id=?').get(id);}
 save(id,payload,plan){this.db.prepare('INSERT OR IGNORE INTO notion_drafts(id,payload,plan,expires) VALUES(?,?,?,?)').run(id,JSON.stringify(payload),JSON.stringify(plan),Date.now()+3600000);return this.get(id);}
 claim(id){return this.db.prepare("UPDATE notion_drafts SET status='running' WHERE id=? AND status='ready'").run(id).changes===1;}
 finish(id,result){this.db.prepare("UPDATE notion_drafts SET result=?,status='done' WHERE id=?").run(JSON.stringify(result),id);}
 steps(id){return this.db.prepare('SELECT id,result FROM notion_steps WHERE substr(id,1,?)=?').all(id.length+1,id+':');}
 resolved(id){const row=this.db.prepare('SELECT result FROM notion_steps WHERE id=?').get(id);return row?.result?JSON.parse(row.result):null;}
 resolve(id,result){this.db.prepare('UPDATE notion_steps SET result=? WHERE id=? AND result IS NULL').run(JSON.stringify(result),id);}
 async step(id,fn){const prior=this.db.prepare('SELECT result FROM notion_steps WHERE id=?').get(id);if(prior){if(prior.result)return JSON.parse(prior.result);throw new Error('Previous write outcome is uncertain. Inspect Notion before reconciliation; do not create a new request.');}
 this.db.prepare('INSERT INTO notion_steps VALUES (?,NULL)').run(id);
 const result=await fn();this.db.prepare('UPDATE notion_steps SET result=? WHERE id=?').run(JSON.stringify(result),id);return result;}
 close(){this.db.close();}
}
