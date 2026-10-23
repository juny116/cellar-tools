import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createStore} from './store-factory.mjs';
import {searchSake} from '../src/sake-search.mjs';
export function createApp(store){
 const csrf=randomBytes(32).toString('hex');let inventory=[];
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 return createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  if(!/^(localhost|127\.0\.0\.1):\d+$/.test(req.headers.host??''))return send(res,403,{error:'Local access only'});
  try{
   const url=new URL(req.url,`http://${req.headers.host}`);
   if(req.method==='GET'){
    if(url.pathname==='/api/state'){inventory=await store.listInventory({includeConsumed:true});return send(res,200,{inventory:inventory.map(b=>({...b,images:(b.images??[]).map((_,i)=>`/api/image/${b.id}/${i}`)})),capabilities:store.capabilities,csrf,preferences:await store.getPreferences()});}
    if(url.pathname==='/api/context')return send(res,200,{inventory:await store.listInventory(),preferences:await store.getPreferences(),instruction:'Recommend from these actual bottle IDs. Distinguish facts from opinions. Verify prices externally. Do not mutate inventory without user authorization.'});
    const image=url.pathname.match(/^\/api\/image\/([^/]+)\/(\d+)$/);
    if(image){
     const source=inventory.find(b=>b.id===image[1])?.images?.[Number(image[2])];if(!source)return send(res,404,{error:'Image not found; refresh collection'});
     const u=new URL(source);if(u.protocol!=='https:'||!['.amazonaws.com','.notion.so','.notionusercontent.com'].some(s=>u.hostname.endsWith(s)))return send(res,422,{error:'External image host not supported'});
     const upstream=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(15000)});const type=upstream.headers.get('content-type')??'';
     if(!upstream.ok||!/^image\/(jpeg|png|webp|gif|avif)(;|$)/.test(type))throw new Error('Image unavailable');
     const chunks=[];let size=0;for await(const chunk of upstream.body){size+=chunk.length;if(size>20*1024*1024)throw new Error('Image too large');chunks.push(chunk);}
     res.writeHead(200,{'Content-Type':type,'Cache-Control':'private,max-age=300'});return res.end(Buffer.concat(chunks));
    }
    const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
    if(files[url.pathname]){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.end(await readFile(new URL('./web/'+files[url.pathname],import.meta.url)));}
    return send(res,404,{error:'Not found'});
   }
   if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
   if(req.headers.origin!==`http://${req.headers.host}`||req.headers['x-cellar-csrf']!==csrf||!req.headers['content-type']?.startsWith('application/json'))return send(res,403,{error:'Invalid request origin or session'});
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>15*1024*1024)return send(res,413,{error:'Request too large'});}const input=JSON.parse(body);
   if(url.pathname==='/api/upload'){if(!store.attachPhoto)return send(res,400,{error:'Photo attachments currently require Notion storage'});return send(res,200,await store.attachPhoto(input.bottleId,input.filename,input.base64));}
   if(url.pathname==='/api/prepare')return send(res,200,await store.prepare(input.requestId,input.change));
   if(url.pathname==='/api/commit')return send(res,200,await store.commit(input.draftId,input.confirmed));
   if(url.pathname==='/api/search')return send(res,200,await searchSake(input.brewery,input.brand??''));
   return send(res,404,{error:'Not found'});
  }catch(e){send(res,400,{error:e.message});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const store=await createStore();const port=Number(process.env.PORT??8877);const server=createApp(store);
 server.listen(port,'127.0.0.1',()=>console.log(`Cellar http://127.0.0.1:${port}`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
}
