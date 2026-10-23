import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {SqliteStore} from './sqlite-store.mjs';
import {NotionStore} from './notion-store.mjs';
export async function createStore(env=process.env){
 const backend=env.CELLAR_BACKEND??'sqlite';
 if(backend==='sqlite')return new SqliteStore(env.CELLAR_DB??join(homedir(),'.local/share/cellar-assistant/cellar.sqlite'));
 if(backend!=='notion')throw new Error('Unknown CELLAR_BACKEND');
 const config=JSON.parse(await readFile(env.CELLAR_NOTION_CONFIG,'utf8'));
 return new NotionStore({...config,token:env.NOTION_TOKEN,journalPath:env.CELLAR_JOURNAL??join(homedir(),'.local/share/cellar-assistant/notion-journal.sqlite')});
}
